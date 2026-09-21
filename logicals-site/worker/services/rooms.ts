import { HttpError } from '../http';
import type {
  NewRoom,
  RoomAggregate,
  RoomMemberRecord,
  RoomRepository,
  RoomState,
} from '../repositories/rooms';
import { objectBody } from '../validation';

const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE = /^[A-HJ-NP-Z2-9]{6}$/;
const FINGERPRINT = /^[0-9a-f]{64}$/;

interface TransitionRoom { state: string; startsAt: number | null }
interface TransitionMember { playerId: number; loadedAt: unknown; readyAt: unknown }

export function advanceRoom(
  room: TransitionRoom,
  members: TransitionMember[],
  now: number,
): { state: string; startsAt: number | null } {
  if (room.startsAt !== null || room.state !== 'waiting') {
    return { state: room.state, startsAt: room.startsAt };
  }
  const readyPlayers = new Set(
    members.filter(member => member.loadedAt && member.readyAt).map(member => member.playerId),
  );
  if (readyPlayers.size !== 2) return { state: room.state, startsAt: null };
  return { state: 'countdown', startsAt: now + 4_000 };
}

function roomError(status: number, code: string, message: string): never {
  throw new HttpError(status, message, code);
}

function timestamp(value: string | number): number {
  return typeof value === 'number' ? value : Date.parse(value);
}

export function validateJoin(
  room: { state: string; startsAt: unknown; expiresAt: string | number; hostPlayerId: number; puzzleFingerprint: string },
  members: Array<{ playerId: number; role?: string }>,
  input: { playerId: number; puzzleFingerprint: string },
  now: number,
): void {
  if (timestamp(room.expiresAt) <= now || room.state === 'expired') {
    roomError(410, 'ROOM_EXPIRED', 'Dieser Duellraum ist abgelaufen.');
  }
  if (room.state !== 'waiting' || room.startsAt !== null) {
    roomError(409, 'ROOM_STARTED', 'Dieses Duell hat bereits begonnen.');
  }
  if (room.hostPlayerId === input.playerId || members.some(member => member.playerId === input.playerId)) {
    roomError(409, 'PLAYER_DUPLICATE', 'Ein Spieler kann nicht beide Plätze belegen.');
  }
  if (members.some(member => member.role === 'guest') || members.length >= 2) {
    roomError(409, 'ROOM_FULL', 'Dieser Duellraum ist bereits voll.');
  }
  if (room.puzzleFingerprint !== input.puzzleFingerprint) {
    roomError(409, 'PUZZLE_MISMATCH', 'Das erzeugte Rätsel stimmt nicht mit dem Raum überein.');
  }
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 1) throw new HttpError(400, `${label} ist ungültig.`);
  return Number(value);
}

function nonnegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new HttpError(400, `${label} ist ungültig.`);
  return Number(value);
}

function text(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `${label} ist ungültig.`);
  const normalized = value.normalize('NFKC').trim();
  if (!normalized || [...normalized].length > maximum) throw new HttpError(400, `${label} ist ungültig.`);
  return normalized;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`).join(',')}}`;
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new HttpError(400, 'Die Rätselkonfiguration ist ungültig.');
  return encoded;
}

export function generateRoomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, byte => ROOM_ALPHABET[byte & 31]).join('');
}

export function generateMemberToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function hashMemberToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

function codeFrom(input: string): string {
  const code = input.normalize('NFKC').trim().toUpperCase();
  if (!ROOM_CODE.test(code)) throw new HttpError(400, 'Der Raumcode ist ungültig.', 'ROOM_CODE_INVALID');
  return code;
}

function publicSnapshot(aggregate: RoomAggregate, serverNow: number) {
  const room = aggregate.room;
  return {
    id: room.id,
    code: room.code,
    state: room.state,
    serverNow,
    startsAt: room.startsAt ? Date.parse(room.startsAt) : null,
    expiresAt: Date.parse(room.expiresAt),
    configuration: JSON.parse(room.configurationJson),
    bookletSeed: room.bookletSeed,
    puzzleIndex: room.puzzleIndex,
    puzzleFingerprint: room.puzzleFingerprint,
    puzzleTitle: room.puzzleTitle,
    puzzleThemeId: room.puzzleThemeId,
    effectivePuzzleSeed: room.effectivePuzzleSeed,
    members: aggregate.members.map(member => ({
      playerId: member.playerId,
      displayName: member.displayName,
      role: member.role,
      loaded: Boolean(member.loadedAt),
      ready: Boolean(member.readyAt),
      // A count, never which cells.
      filled: member.progressFilled ?? null,
    })),
  };
}

async function refreshed(repository: RoomRepository, code: string, now: number): Promise<RoomAggregate> {
  let aggregate = await repository.findByCode(code);
  if (!aggregate) roomError(404, 'ROOM_NOT_FOUND', 'Dieser Duellraum wurde nicht gefunden.');
  const nowIso = new Date(now).toISOString();
  if (Date.parse(aggregate.room.expiresAt) <= now && aggregate.room.state !== 'complete') {
    await repository.markExpired(code, nowIso);
    aggregate = await repository.findByCode(code) ?? aggregate;
  } else if (aggregate.room.state === 'countdown' && aggregate.room.startsAt
    && Date.parse(aggregate.room.startsAt) <= now) {
    await repository.markActive(code, nowIso);
    aggregate = await repository.findByCode(code) ?? aggregate;
  }
  return aggregate;
}

async function startIfReady(repository: RoomRepository, code: string, now: number) {
  const aggregate = await refreshed(repository, code, now);
  const transition = advanceRoom({
    state: aggregate.room.state,
    startsAt: aggregate.room.startsAt ? Date.parse(aggregate.room.startsAt) : null,
  }, aggregate.members.map(member => ({
    playerId: member.playerId, loadedAt: member.loadedAt, readyAt: member.readyAt,
  })), now);
  if (transition.startsAt !== null && aggregate.room.startsAt === null) {
    await repository.tryStart(code, new Date(transition.startsAt).toISOString(), new Date(now).toISOString());
  }
  return refreshed(repository, code, now);
}

export async function createRoom(
  repository: RoomRepository,
  rawInput: unknown,
  options: { now?: () => number; code?: () => string; token?: () => string } = {},
) {
  const input = objectBody(rawInput);
  const playerId = positiveInteger(input.playerId, 'Spieler');
  const configuration = objectBody(input.configuration);
  const configurationJson = stableJson(configuration);
  if (configurationJson.length > 8_000) throw new HttpError(400, 'Die Rätselkonfiguration ist zu groß.');
  const puzzleFingerprint = text(input.puzzleFingerprint, 'Rätsel-Fingerprint', 64);
  if (!FINGERPRINT.test(puzzleFingerprint)) throw new HttpError(400, 'Der Rätsel-Fingerprint ist ungültig.');
  const now = (options.now ?? Date.now)();
  const nowIso = new Date(now).toISOString();
  const memberToken = (options.token ?? generateMemberToken)();
  const memberTokenHash = await hashMemberToken(memberToken);

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = (options.code ?? generateRoomCode)();
    const room: NewRoom = {
      code,
      hostPlayerId: playerId,
      configurationJson,
      bookletSeed: nonnegativeInteger(input.bookletSeed, 'Booklet-Seed'),
      puzzleIndex: nonnegativeInteger(input.puzzleIndex, 'Rätselindex'),
      puzzleFingerprint,
      puzzleTitle: text(input.puzzleTitle, 'Rätseltitel', 200),
      puzzleThemeId: text(input.puzzleThemeId, 'Rätselthema', 80),
      effectivePuzzleSeed: nonnegativeInteger(input.effectivePuzzleSeed, 'Rätsel-Seed'),
      state: 'waiting',
      startsAt: null,
      expiresAt: new Date(now + 86_400_000).toISOString(),
      createdAt: nowIso,
    };
    if (await repository.create(room, {
      playerId, role: 'host', memberTokenHash, loadedAt: nowIso, readyAt: null, joinedAt: nowIso,
    })) {
      const aggregate = await repository.findByCode(code);
      if (!aggregate) throw new Error('Created room could not be loaded.');
      return { room: publicSnapshot(aggregate, now), memberToken };
    }
  }
  throw new HttpError(503, 'Es konnte gerade kein freier Raumcode erzeugt werden.');
}

export async function joinRoom(
  repository: RoomRepository,
  rawCode: string,
  rawInput: unknown,
  options: { now?: () => number; token?: () => string } = {},
) {
  const code = codeFrom(rawCode);
  const input = objectBody(rawInput);
  const playerId = positiveInteger(input.playerId, 'Spieler');
  const puzzleFingerprint = text(input.puzzleFingerprint, 'Rätsel-Fingerprint', 64);
  if (!FINGERPRINT.test(puzzleFingerprint)) throw new HttpError(400, 'Der Rätsel-Fingerprint ist ungültig.');
  const now = (options.now ?? Date.now)();
  let aggregate = await refreshed(repository, code, now);
  validateJoin(aggregate.room, aggregate.members, { playerId, puzzleFingerprint }, now);
  const memberToken = (options.token ?? generateMemberToken)();
  const tokenHash = await hashMemberToken(memberToken);
  const nowIso = new Date(now).toISOString();
  const joined = await repository.tryJoin(code, {
    playerId, role: 'guest', memberTokenHash: tokenHash,
    loadedAt: nowIso, readyAt: null, joinedAt: nowIso,
  }, puzzleFingerprint, nowIso);
  if (!joined) {
    aggregate = await refreshed(repository, code, now);
    validateJoin(aggregate.room, aggregate.members, { playerId, puzzleFingerprint }, now);
    roomError(409, 'ROOM_CHANGED', 'Der Duellraum wurde gleichzeitig verändert.');
  }
  aggregate = await refreshed(repository, code, now);
  return { room: publicSnapshot(aggregate, now), memberToken };
}

async function authorizeUpdate(
  repository: RoomRepository,
  code: string,
  rawInput: unknown,
  kind: 'loaded' | 'ready',
  now: number,
) {
  const input = objectBody(rawInput);
  const playerId = positiveInteger(input.playerId, 'Spieler');
  const memberToken = text(input.memberToken, 'Raumzugriff', 200);
  const tokenHash = await hashMemberToken(memberToken);
  const nowIso = new Date(now).toISOString();
  const updated = kind === 'loaded'
    ? await repository.markLoaded(code, playerId, tokenHash, nowIso)
    : await repository.markReady(code, playerId, tokenHash, nowIso);
  if (!updated) roomError(403, 'MEMBER_FORBIDDEN', 'Der Raumzugriff ist nicht gültig.');
  return publicSnapshot(await startIfReady(repository, code, now), now);
}

export function markRoomLoaded(repository: RoomRepository, rawCode: string, input: unknown, now = Date.now()) {
  return authorizeUpdate(repository, codeFrom(rawCode), input, 'loaded', now);
}

export function markRoomReady(repository: RoomRepository, rawCode: string, input: unknown, now = Date.now()) {
  return authorizeUpdate(repository, codeFrom(rawCode), input, 'ready', now);
}

/** Cells in the full triangular matrix for a configuration. */
export function cellCountFor(configuration: { categoryCount: number; valuesPerCategory: number }): number {
  const categories = Number(configuration.categoryCount);
  const values = Number(configuration.valuesPerCategory);
  if (!Number.isFinite(categories) || !Number.isFinite(values)) return 0;
  const blocks = (categories * (categories - 1)) / 2;
  return Math.max(0, Math.floor(blocks * values * values));
}

/**
 * A client may only report a count, and only a possible one.
 *
 * The other player sees this number, so a client must not be able to put
 * nonsense in front of them - nor a value that implies a grid this room does
 * not have.
 */
export function clampProgress(filled: unknown, cellCount: number): number {
  const value = Number(filled);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(cellCount, Math.floor(value)));
}

/**
 * Records how many cells one member has filled.
 *
 * Deliberately NOT part of authorizeUpdate's loaded/ready pair: those advance
 * the room's state machine and then try to start the game. Progress changes
 * nothing about the room, so it must not run that path.
 */
export async function recordRoomProgress(
  repository: RoomRepository,
  rawCode: string,
  rawInput: unknown,
  now = Date.now(),
) {
  const code = codeFrom(rawCode);
  const input = objectBody(rawInput);
  const playerId = positiveInteger(input.playerId, 'Spieler');
  const memberToken = text(input.memberToken, 'Raumzugriff', 200);
  const tokenHash = await hashMemberToken(memberToken);

  const aggregate = await refreshed(repository, code, now);
  const filled = clampProgress(input.filled, cellCountFor(JSON.parse(aggregate.room.configurationJson)));

  const updated = await repository.recordProgress(
    code, playerId, tokenHash, filled, new Date(now).toISOString(),
  );
  if (!updated) roomError(403, 'MEMBER_FORBIDDEN', 'Der Raumzugriff ist nicht gültig.');
  return publicSnapshot(await refreshed(repository, code, now), now);
}

/**
 * Schließt den Raum, weil ein Mitglied aufgibt.
 *
 * Wer aufhört, weil der Gegner längst fertig ist, verschwand bisher
 * stillschweigend: der andere sah einen Spinner, bis der Raum nach 24 Stunden
 * ablief, und wusste nicht, ob noch gespielt wird.
 *
 * Bewusst der Zustand 'complete' und kein eigener: die CHECK-Bedingung auf
 * `rooms.state` erlaubt nur ('waiting','countdown','active','complete',
 * 'expired'), und ein neuer Wert wäre in SQLite eine Migration mitsamt
 * Tabellenneubau. Zu unterscheiden ist der Fall trotzdem — „abgeschlossen mit
 * nur EINEM Ergebnis" kann es sonst nicht geben, weil markComplete
 * ausschließlich bei zwei Ergebnissen gerufen wird.
 *
 * Wie bei recordRoomProgress absichtlich NICHT über authorizeUpdate: das
 * treibt die Zustandsmaschine voran und versucht, das Spiel zu starten.
 */
export async function forfeitRoom(
  repository: RoomRepository,
  rawCode: string,
  rawInput: unknown,
  now = Date.now(),
) {
  const code = codeFrom(rawCode);
  const input = objectBody(rawInput);
  const playerId = positiveInteger(input.playerId, 'Spieler');
  const memberToken = text(input.memberToken, 'Raumzugriff', 200);
  const tokenHash = await hashMemberToken(memberToken);

  const aggregate = await refreshed(repository, code, now);
  const member = aggregate.members.find(candidate => candidate.playerId === playerId);
  if (!member || member.memberTokenHash !== tokenHash) {
    roomError(403, 'MEMBER_FORBIDDEN', 'Der Raumzugriff ist nicht gültig.');
  }

  /*
   * Den letzten Stand gleich mitnehmen, wenn er mitgeschickt wurde.
   *
   * Der Fortschrittsmelder läuft nur alle fünf Sekunden. Ohne diesen Schritt
   * zeigte die Kachel des Aufgebenden einen bis zu fünf Sekunden alten Wert —
   * oder gar keinen, wenn er vor dem ersten Tick aussteigt.
   */
  if (input.filled !== undefined && input.filled !== null) {
    const filled = clampProgress(input.filled, cellCountFor(JSON.parse(aggregate.room.configurationJson)));
    await repository.recordProgress(code, playerId, tokenHash, filled, new Date(now).toISOString());
  }

  await repository.markComplete(aggregate.room.id);
  return publicSnapshot(await refreshed(repository, code, now), now);
}

export async function getRoomSnapshot(repository: RoomRepository, rawCode: string, now = Date.now()) {
  const code = codeFrom(rawCode);
  return publicSnapshot(await refreshed(repository, code, now), now);
}

export async function resolveDuelResultContext(
  repository: RoomRepository,
  input: { roomId: number; playerId: number; memberToken: string },
  now = Date.now(),
) {
  const aggregate = await repository.findById(input.roomId);
  if (!aggregate) roomError(404, 'ROOM_NOT_FOUND', 'Dieser Duellraum wurde nicht gefunden.');
  const tokenHash = await hashMemberToken(input.memberToken);
  const member = aggregate.members.find(candidate => candidate.playerId === input.playerId
    && candidate.memberTokenHash === tokenHash);
  if (!member) roomError(403, 'MEMBER_FORBIDDEN', 'Der Raumzugriff ist nicht gültig.');
  if (aggregate.room.state === 'expired'
    || (aggregate.room.state !== 'complete' && Date.parse(aggregate.room.expiresAt) <= now)) {
    roomError(410, 'ROOM_EXPIRED', 'Dieser Duellraum ist abgelaufen.');
  }
  const startsAt = aggregate.room.startsAt ? Date.parse(aggregate.room.startsAt) : NaN;
  if (!Number.isFinite(startsAt) || startsAt > now
    || !['countdown', 'active', 'complete'].includes(aggregate.room.state)) {
    roomError(409, 'ROOM_NOT_STARTED', 'Dieses Duell hat noch nicht begonnen.');
  }
  const configuration = JSON.parse(aggregate.room.configurationJson) as Record<string, unknown>;
  return {
    puzzleFingerprint: aggregate.room.puzzleFingerprint,
    puzzleTitle: aggregate.room.puzzleTitle,
    themeId: aggregate.room.puzzleThemeId,
    difficulty: typeof configuration.difficulty === 'string' ? configuration.difficulty : 'mittel',
    seed: aggregate.room.effectivePuzzleSeed,
    configurationJson: aggregate.room.configurationJson,
    serverElapsedMs: Math.max(0, now - startsAt),
  };
}
