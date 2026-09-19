import { describe, expect, it } from 'vitest';
import { createApp } from '../worker/index';
import type {
  NewResult,
  ResultRecord,
  ResultRepository,
} from '../worker/repositories/results';
import { publicDuelResults, rankDuelResults, submitResult } from '../worker/services/results';
import { resolveDuelResultContext } from '../worker/services/rooms';
import type { RoomRepository } from '../worker/repositories/rooms';

class MemoryResults implements ResultRepository {
  private nextId = 1;
  readonly results: ResultRecord[] = [];

  async findByAttemptKey(attemptKey: string) {
    return this.results.find(result => result.attemptKey === attemptKey) ?? null;
  }

  async findByRoomPlayer(roomId: number, playerId: number) {
    return this.results.find(result => result.roomId === roomId && result.playerId === playerId) ?? null;
  }

  async insert(input: NewResult) {
    if (await this.findByAttemptKey(input.attemptKey)) return false;
    if (input.roomId && await this.findByRoomPlayer(input.roomId, input.playerId)) return false;
    this.results.push({ id: this.nextId++, ...input });
    return true;
  }

  async listByPlayer(playerId: number, limit: number) {
    return this.results
      .filter(result => result.playerId === playerId)
      .sort((a, b) => b.completedAt.localeCompare(a.completedAt) || b.id - a.id)
      .slice(0, limit);
  }

  async listByRoom(roomId: number) {
    return this.results.filter(result => result.roomId === roomId);
  }

  async listSolvedSeeds(playerId: number, minSeed: number) {
    const seeds = this.results
      .filter(result => result.playerId === playerId && result.seed >= minSeed)
      .map(result => result.seed);
    return [...new Set(seeds)].sort((a, b) => a - b);
  }
}

const submission = {
  playerId: 1,
  attemptKey: '11111111-1111-4111-8111-111111111111',
  puzzleFingerprint: 'a'.repeat(64),
  puzzleTitle: 'Logik im Museum',
  themeId: 'museum',
  difficulty: 'mittel',
  seed: 42,
  configuration: { categoryCount: 4, seed: 42 },
  elapsedMs: 50_000,
  failedChecks: 1,
};

describe('duel ranking', () => {
  it('ranks time before failed checks and supports ties', () => {
    expect(rankDuelResults(
      { elapsedMs: 50_000, failedChecks: 4 },
      { elapsedMs: 51_000, failedChecks: 0 },
    )).toBe('a');
    expect(rankDuelResults(
      { elapsedMs: 50_000, failedChecks: 2 },
      { elapsedMs: 50_000, failedChecks: 1 },
    )).toBe('b');
    expect(rankDuelResults(
      { elapsedMs: 50_000, failedChecks: 1 },
      { elapsedMs: 50_000, failedChecks: 1 },
    )).toBe('tie');
  });

  it('labels both players from the same ordered comparison', () => {
    const results = [
      { ...submission, id: 1, roomId: 7, configurationJson: '{}', completedAt: 'a' },
      { ...submission, id: 2, playerId: 2, roomId: 7, attemptKey: '22222222-2222-4222-8222-222222222222', elapsedMs: 51_000, configurationJson: '{}', completedAt: 'b' },
    ];
    expect(publicDuelResults([
      { playerId: 1, displayName: 'Ada' }, { playerId: 2, displayName: 'Bea' },
    ], results).map(result => result.outcome)).toEqual(['won', 'lost']);
  });
});

describe('result persistence', () => {
  it('makes identical retries idempotent', async () => {
    const repository = new MemoryResults();
    const first = await submitResult(repository, submission, {
      now: () => '2026-09-16T10:00:00.000Z',
    });
    const retry = await submitResult(repository, submission, {
      now: () => '2026-09-16T10:05:00.000Z',
    });

    expect(first.created).toBe(true);
    expect(retry.created).toBe(false);
    expect(retry.result.id).toBe(first.result.id);
    expect(repository.results).toHaveLength(1);
  });

  it('rejects reuse of an attempt key with changed scoring data', async () => {
    const repository = new MemoryResults();
    await submitResult(repository, submission);

    await expect(submitResult(repository, { ...submission, elapsedMs: 50_001 }))
      .rejects.toEqual(expect.objectContaining({ status: 409 }));
  });

  it('validates attempt keys, fingerprints, and counters', async () => {
    const repository = new MemoryResults();
    await expect(submitResult(repository, { ...submission, attemptKey: 'nope' }))
      .rejects.toEqual(expect.objectContaining({ status: 400 }));
    await expect(submitResult(repository, { ...submission, failedChecks: -1 }))
      .rejects.toEqual(expect.objectContaining({ status: 400 }));
  });

  it('serves idempotent writes and newest-first player history', async () => {
    const repository = new MemoryResults();
    const app = createApp({
      resultRepository: repository,
      now: () => '2026-09-16T10:00:00.000Z',
    });
    const request = () => new Request('https://example.test/api/results', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(submission),
    });

    expect((await app.fetch(request(), {} as never)).status).toBe(201);
    expect((await app.fetch(request(), {} as never)).status).toBe(200);
    const history = await app.fetch(
      new Request('https://example.test/api/players/1/results?limit=50'),
      {} as never,
    );
    expect((await history.json()).results).toHaveLength(1);
  });
});

describe('authoritative duel results', () => {
  it('authenticates the member and derives time and puzzle data from the room', async () => {
    const token = 'duel-secret';
    const tokenHash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    const hash = Array.from(new Uint8Array(tokenHash), byte => byte.toString(16).padStart(2, '0')).join('');
    const aggregate = {
      room: {
        id: 7, code: 'ABC234', hostPlayerId: 1,
        configurationJson: JSON.stringify({ difficulty: 'schwer', themeId: 'museum', seed: 42 }),
        bookletSeed: 42, puzzleIndex: 0, puzzleFingerprint: 'b'.repeat(64),
        puzzleTitle: 'Kanonisches Rätsel', puzzleThemeId: 'museum', effectivePuzzleSeed: 1042,
        state: 'active' as const,
        startsAt: '1970-01-01T00:00:10.000Z', expiresAt: '1970-01-02T00:00:00.000Z',
        createdAt: '1970-01-01T00:00:00.000Z',
      },
      members: [{
        roomId: 7, playerId: 1, displayName: 'A', role: 'host' as const,
        memberTokenHash: hash, loadedAt: 'x', readyAt: 'x', joinedAt: 'x',
      }],
    };
    const repository = {
      findById: async (id: number) => id === 7 ? aggregate : null,
    } as unknown as RoomRepository;

    const context = await resolveDuelResultContext(repository, {
      roomId: 7, playerId: 1, memberToken: token,
    }, 25_000);

    expect(context).toEqual(expect.objectContaining({
      puzzleFingerprint: 'b'.repeat(64),
      puzzleTitle: 'Kanonisches Rätsel',
      difficulty: 'schwer',
      seed: 1042,
      serverElapsedMs: 15_000,
    }));
    await expect(resolveDuelResultContext(repository, {
      roomId: 7, playerId: 1, memberToken: 'wrong',
    }, 25_000)).rejects.toEqual(expect.objectContaining({ status: 403 }));
  });

  it('overrides client-controlled duel metadata and elapsed time', async () => {
    const repository = new MemoryResults();
    const result = await submitResult(repository, {
      ...submission,
      roomId: 7,
      memberToken: 'secret',
      elapsedMs: 1,
    }, {
      resolveDuelContext: async () => ({
        puzzleFingerprint: 'b'.repeat(64), puzzleTitle: 'Kanonisch', themeId: 'museum',
        difficulty: 'schwer', seed: 99, configurationJson: '{"seed":99}', serverElapsedMs: 15_000,
      }),
    });
    expect(result.result).toEqual(expect.objectContaining({
      puzzleFingerprint: 'b'.repeat(64), puzzleTitle: 'Kanonisch', elapsedMs: 1,
    }));
  });

  it('rejects an expired room even when no snapshot read refreshed its state', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('valid'));
    const memberTokenHash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    const repository = {
      findById: async () => ({
        room: {
          id: 7, code: 'ABC234', hostPlayerId: 1, configurationJson: '{}', bookletSeed: 1,
          puzzleIndex: 0, puzzleFingerprint: 'b'.repeat(64), puzzleTitle: 'Alt',
          puzzleThemeId: 'museum', effectivePuzzleSeed: 1, state: 'active',
          startsAt: '1970-01-01T00:00:10.000Z', expiresAt: '1970-01-01T00:00:20.000Z',
          createdAt: '1970-01-01T00:00:00.000Z',
        },
        members: [{
          roomId: 7, playerId: 1, displayName: 'A', role: 'host', memberTokenHash,
          loadedAt: 'x', readyAt: 'x', joinedAt: 'x',
        }],
      }),
    } as unknown as RoomRepository;
    await expect(resolveDuelResultContext(repository, {
      roomId: 7, playerId: 1, memberToken: 'valid',
    }, 25_000)).rejects.toEqual(expect.objectContaining({ status: 410, code: 'ROOM_EXPIRED' }));
  });
});
