import type { Page, Route } from '@playwright/test';

/*
 * A fake duel server, shared by every two-device duel scenario.
 *
 * It exists as its own module because the one that used to live inside a single
 * spec drifted from the real Worker, and the drift hid a bug worth a bug report:
 * it left a started room on 'countdown' for ever, so the client branch that
 * starts a game from inside its poll was never entered by any test.
 *
 * The rule for anything added here: if worker/services/rooms.ts does it on a
 * room read, this does it too.
 */

export type Member = {
  playerId: number;
  displayName: string;
  role: 'host' | 'guest';
  loaded: boolean;
  ready: boolean;
  filled?: number;
};

export type DuelState = {
  room: null | Record<string, any>;
  members: Member[];
  tokens: Record<number, string>;
  results: Array<Record<string, any>>;
};

export function createDuelState(): DuelState {
  return { room: null, members: [], tokens: {}, results: [] };
}

export const ROOM_CODE = 'ABC234';

/** How long the server waits between both players being ready and the start. */
export const COUNTDOWN_MS = 4_000;

export type DuelApiOptions = {
  playerId: number;
  displayName: string;
  state: DuelState;
  /**
   * Milliseconds by which this client's view of the server clock lags the clock
   * the room actually transitions on.
   *
   * Stands in for the two things that cause it in the wild: a device clock that
   * disagrees with the server, and iOS throttling timers while the app is in
   * the background. Either way the client learns that the duel has started from
   * a poll rather than from its own countdown - and the game must still start
   * exactly once.
   */
  clockLagMs?: number;
};

export async function installDuelApi(page: Page, options: DuelApiOptions): Promise<void> {
  const { playerId, displayName, state, clockLagMs = 0 } = options;

  await page.addInitScript(({ playerId, displayName }) => localStorage.setItem(
    'logicals.players.v1',
    JSON.stringify({ players: [{ id: playerId, displayName }], selectedPlayerId: playerId }),
  ), { playerId, displayName });

  await page.route('**/api/**', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const json = (value: unknown, status = 200) => route.fulfill({
      status, contentType: 'application/json', body: JSON.stringify(value),
    });

    if (url.pathname === '/api/players') {
      return json({ players: [{ id: playerId, displayName, createdAt: '2026-09-17T00:00:00Z' }] });
    }

    const body = request.method() === 'POST' ? request.postDataJSON() : {};

    /*
     * Mirrors worker/services/rooms.ts `refreshed`: every read settles the room
     * first, so a countdown whose start instant has passed reads as 'active'.
     */
    if (state.room?.state === 'countdown' && state.room.startsAt
      && state.room.startsAt <= Date.now()) {
      state.room.state = 'active';
    }

    /** What this client is told the time is - behind the transition clock. */
    const reportedNow = () => Date.now() - clockLagMs;
    const snapshot = () => ({ ...state.room, serverNow: reportedNow(), members: state.members });

    if (url.pathname === '/api/rooms' && request.method() === 'POST') {
      state.members = [{ playerId, displayName, role: 'host', loaded: true, ready: false }];
      state.tokens[playerId] = 'host-token';
      state.room = {
        id: 7, code: ROOM_CODE, state: 'waiting', serverNow: reportedNow(), startsAt: null,
        expiresAt: Date.now() + 86_400_000, configuration: body.configuration,
        bookletSeed: body.bookletSeed, puzzleIndex: body.puzzleIndex,
        puzzleFingerprint: body.puzzleFingerprint, puzzleTitle: body.puzzleTitle,
        puzzleThemeId: body.puzzleThemeId, effectivePuzzleSeed: body.effectivePuzzleSeed, results: [],
      };
      return json({ room: { ...state.room, members: state.members }, memberToken: state.tokens[playerId] }, 201);
    }

    if (!state.room) return json({ error: 'missing room' }, 404);

    if (url.pathname === '/api/results' && request.method() === 'POST') {
      const member = state.members.find(candidate => candidate.playerId === body.playerId)!;
      state.results.push({
        playerId: body.playerId, displayName: member.displayName, elapsedMs: body.elapsedMs,
        failedChecks: body.failedChecks, completedAt: new Date().toISOString(), outcome: 'waiting',
      });
      if (state.results.length === 2) {
        const winner = state.results[0].elapsedMs <= state.results[1].elapsedMs ? 0 : 1;
        state.results.forEach((result, index) => { result.outcome = index === winner ? 'won' : 'lost'; });
        state.room.state = 'complete';
      }
      state.room.results = state.results;
      return json({ result: body }, 201);
    }

    if (url.pathname.endsWith('/join')) {
      // The Worker answers 409 ROOM_STARTED once a room has left 'waiting'.
      if (state.room.state !== 'waiting' || state.room.startsAt !== null) {
        return json({ error: 'ROOM_STARTED', message: 'Dieses Duell hat bereits begonnen.' }, 409);
      }
      state.members.push({ playerId, displayName, role: 'guest', loaded: true, ready: false });
      state.tokens[playerId] = 'guest-token';
      return json({ room: snapshot(), memberToken: state.tokens[playerId] }, 201);
    }

    if (url.pathname.endsWith('/loaded')) {
      const member = state.members.find(candidate => candidate.playerId === body.playerId)!;
      member.loaded = true;
      return json({ room: snapshot() });
    }

    if (url.pathname.endsWith('/ready')) {
      const member = state.members.find(candidate => candidate.playerId === body.playerId)!;
      member.ready = true;
      if (state.members.length === 2 && state.members.every(candidate => candidate.ready)
        && !state.room.startsAt) {
        state.room.startsAt = Date.now() + COUNTDOWN_MS;
        state.room.state = 'countdown';
      }
      return json({ room: snapshot() });
    }

    if (url.pathname.endsWith('/progress')) {
      const member = state.members.find(candidate => candidate.playerId === body.playerId)!;
      // A count and nothing else, exactly as the Worker stores it.
      member.filled = body.filled;
      return json({ room: snapshot() });
    }

    if (request.method() === 'GET' && url.pathname === `/api/rooms/${ROOM_CODE}`) {
      return json({ room: snapshot() });
    }

    return json({ error: 'unknown route' }, 404);
  });
}
