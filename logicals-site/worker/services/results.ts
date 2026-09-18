import { HttpError } from '../http';
import type {
  NewResult,
  ResultRecord,
  ResultRepository,
} from '../repositories/results';
import { objectBody } from '../validation';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT = /^[0-9a-f]{64}$/;
const DIFFICULTIES = new Set(['leicht', 'mittel', 'schwer']);

interface Score {
  elapsedMs: number;
  failedChecks: number;
}

interface ValidatedSubmission extends Omit<NewResult, 'completedAt'> {
  memberToken?: string;
}

export interface DuelResultContext {
  puzzleFingerprint: string;
  puzzleTitle: string;
  themeId: string;
  difficulty: string;
  seed: number;
  configurationJson: string;
  serverElapsedMs: number;
}

export interface SubmitResultOptions {
  now?: () => string;
  resolveDuelContext?: (input: {
    roomId: number;
    playerId: number;
    memberToken: string;
  }) => Promise<DuelResultContext>;
}

export function rankDuelResults(a: Score, b: Score): 'a' | 'b' | 'tie' {
  if (a.elapsedMs !== b.elapsedMs) return a.elapsedMs < b.elapsedMs ? 'a' : 'b';
  if (a.failedChecks !== b.failedChecks) return a.failedChecks < b.failedChecks ? 'a' : 'b';
  return 'tie';
}

export function publicDuelResults(
  members: Array<{ playerId: number; displayName: string }>,
  results: ResultRecord[],
) {
  const ranked = results.length === 2 ? rankDuelResults(results[0], results[1]) : null;
  return results.map((result, index) => ({
    playerId: result.playerId,
    displayName: members.find(member => member.playerId === result.playerId)?.displayName ?? 'Spieler',
    elapsedMs: result.elapsedMs,
    failedChecks: result.failedChecks,
    completedAt: result.completedAt,
    outcome: ranked === null ? 'waiting'
      : ranked === 'tie' ? 'tie'
        : ranked === (index === 0 ? 'a' : 'b') ? 'won' : 'lost',
  }));
}

function integer(value: unknown, field: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || Number(value) < minimum) {
    throw new HttpError(400, `${field} ist ungültig.`);
  }
  return Number(value);
}

function shortText(value: unknown, field: string, maximum: number): string {
  if (typeof value !== 'string') throw new HttpError(400, `${field} ist ungültig.`);
  const text = value.normalize('NFKC').trim();
  if (!text || [...text].length > maximum) throw new HttpError(400, `${field} ist ungültig.`);
  return text;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableJson(nested)}`)
      .join(',')}}`;
  }
  const serialized = JSON.stringify(value);
  if (serialized === undefined) throw new HttpError(400, 'Die Rätselkonfiguration ist ungültig.');
  return serialized;
}

function validateSubmission(input: unknown): ValidatedSubmission {
  const body = objectBody(input);
  const playerId = integer(body.playerId, 'Spieler', 1);
  const roomId = body.roomId === undefined || body.roomId === null
    ? null
    : integer(body.roomId, 'Raum', 1);
  const attemptKey = shortText(body.attemptKey, 'Versuchsschlüssel', 64).toLowerCase();
  if (!UUID.test(attemptKey)) throw new HttpError(400, 'Der Versuchsschlüssel ist ungültig.');
  const puzzleFingerprint = shortText(body.puzzleFingerprint, 'Rätsel-Fingerprint', 64);
  if (!FINGERPRINT.test(puzzleFingerprint)) throw new HttpError(400, 'Der Rätsel-Fingerprint ist ungültig.');
  const difficulty = shortText(body.difficulty, 'Schwierigkeit', 16);
  if (!DIFFICULTIES.has(difficulty)) throw new HttpError(400, 'Die Schwierigkeit ist ungültig.');
  const configurationJson = stableJson(objectBody(body.configuration));
  if (configurationJson.length > 8_000) throw new HttpError(400, 'Die Rätselkonfiguration ist zu groß.');

  return {
    playerId,
    roomId,
    attemptKey,
    puzzleFingerprint,
    puzzleTitle: shortText(body.puzzleTitle, 'Rätseltitel', 200),
    themeId: shortText(body.themeId, 'Thema', 80),
    difficulty,
    seed: integer(body.seed, 'Seed'),
    configurationJson,
    elapsedMs: integer(body.elapsedMs, 'Spielzeit'),
    failedChecks: integer(body.failedChecks, 'Fehlversuche'),
    memberToken: body.memberToken === undefined
      ? undefined
      : shortText(body.memberToken, 'Raumzugriff', 200),
  };
}

function sameAttempt(existing: ResultRecord, input: Omit<NewResult, 'completedAt'>): boolean {
  return existing.playerId === input.playerId
    && existing.roomId === input.roomId
    && existing.attemptKey === input.attemptKey
    && existing.puzzleFingerprint === input.puzzleFingerprint
    && existing.puzzleTitle === input.puzzleTitle
    && existing.themeId === input.themeId
    && existing.difficulty === input.difficulty
    && existing.seed === input.seed
    && existing.configurationJson === input.configurationJson
    && existing.elapsedMs === input.elapsedMs
    && existing.failedChecks === input.failedChecks;
}

export function publicResult(result: ResultRecord) {
  return {
    id: result.id,
    playerId: result.playerId,
    roomId: result.roomId,
    attemptKey: result.attemptKey,
    puzzleFingerprint: result.puzzleFingerprint,
    puzzleTitle: result.puzzleTitle,
    themeId: result.themeId,
    difficulty: result.difficulty,
    seed: result.seed,
    configuration: JSON.parse(result.configurationJson),
    elapsedMs: result.elapsedMs,
    failedChecks: result.failedChecks,
    completedAt: result.completedAt,
    // Null on solo rows, and on a duel the other side has not finished yet.
    opponentName: result.opponentName ?? null,
    opponentElapsedMs: result.opponentElapsedMs ?? null,
    opponentFailedChecks: result.opponentFailedChecks ?? null,
  };
}

export async function submitResult(
  repository: ResultRepository,
  rawInput: unknown,
  options: SubmitResultOptions = {},
): Promise<{ result: ResultRecord; created: boolean }> {
  const input = validateSubmission(rawInput);
  let canonical: Omit<NewResult, 'completedAt'> = input;

  if (input.roomId !== null) {
    if (!input.memberToken || !options.resolveDuelContext) {
      throw new HttpError(409, 'Das Duell kann noch nicht ausgewertet werden.');
    }
    const context = await options.resolveDuelContext({
      roomId: input.roomId,
      playerId: input.playerId,
      memberToken: input.memberToken,
    });
    const { serverElapsedMs, ...roomContext } = context;
    if (input.elapsedMs > serverElapsedMs + 5_000) {
      throw new HttpError(409, 'Die gemeldete Spielzeit liegt vor dem gemeinsamen Start.');
    }
    canonical = { ...input, ...roomContext, elapsedMs: input.elapsedMs };
  }

  const existing = await repository.findByAttemptKey(input.attemptKey);
  if (existing) {
    if (!sameAttempt(existing, canonical)) {
      throw new HttpError(409, 'Dieser Versuchsschlüssel gehört zu einem anderen Ergebnis.');
    }
    return { result: existing, created: false };
  }

  const created = await repository.insert({
    ...canonical,
    completedAt: (options.now ?? (() => new Date().toISOString()))(),
  });
  const stored = await repository.findByAttemptKey(input.attemptKey);
  if (!stored) {
    if (input.roomId !== null && await repository.findByRoomPlayer(input.roomId, input.playerId)) {
      throw new HttpError(409, 'Für diesen Spieler wurde im Duell bereits ein Ergebnis gespeichert.');
    }
    throw new Error('Result insert did not create or resolve a row.');
  }
  if (!sameAttempt(stored, canonical)) {
    throw new HttpError(409, 'Dieser Versuchsschlüssel gehört zu einem anderen Ergebnis.');
  }
  return { result: stored, created };
}
