import { readFileSync } from 'node:fs';
// Node 24 provides this stable module; the pinned @types/node release predates it.
// @ts-expect-error runtime module is available in the test image
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createRoomsRepository } from '../worker/repositories/rooms';
import { createResultsRepository } from '../worker/repositories/results';
import type { D1Database, D1PreparedStatement, D1Result } from '../worker/types';

class SqliteStatement implements D1PreparedStatement {
  private values: unknown[] = [];
  constructor(private database: any, private query: string) {}
  bind(...values: unknown[]) { this.values = values; return this; }
  async all<T>(): Promise<D1Result<T>> {
    return { results: this.database.prepare(this.query).all(...this.values) as T[] };
  }
  async first<T>(): Promise<T | null> {
    return (this.database.prepare(this.query).get(...this.values) as T | undefined) ?? null;
  }
  async run(): Promise<D1Result> {
    const result = this.database.prepare(this.query).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
}

function adapter(database: any): D1Database {
  return {
    prepare: query => new SqliteStatement(database, query),
    async batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]> {
      database.exec('BEGIN');
      try {
        const results: D1Result<T>[] = [];
        for (const statement of statements) results.push(await statement.run() as D1Result<T>);
        database.exec('COMMIT');
        return results;
      } catch (error) {
        database.exec('ROLLBACK');
        throw error;
      }
    },
  };
}

describe('D1 repository SQL', () => {
  it('creates and reads a room with canonical puzzle metadata', async () => {
    const database = new DatabaseSync(':memory:');
    // Every migration, in order - the same state production is in, rather than
    // whichever one the test happened to be written against.
    for (const migration of ['0000_logicals_multiplayer', '0001_duel_progress']) {
      database.exec(readFileSync(`drizzle/${migration}.sql`, 'utf8')
        .replaceAll('--> statement-breakpoint', ''));
    }
    database.exec("INSERT INTO players (id, display_name, normalized_name, created_at) VALUES (1, 'Ada', 'ada', 'x')");
    const repository = createRoomsRepository(adapter(database));
    const created = await repository.create({
      code: 'ABC234', hostPlayerId: 1, configurationJson: '{"seed":41}', bookletSeed: 41,
      puzzleIndex: 0, puzzleFingerprint: 'a'.repeat(64), puzzleTitle: 'Museum',
      puzzleThemeId: 'museum', effectivePuzzleSeed: 1041, state: 'waiting', startsAt: null,
      expiresAt: '2099-01-01T00:00:00.000Z', createdAt: '2026-09-17T00:00:00.000Z',
    }, {
      playerId: 1, role: 'host', memberTokenHash: 'hash', loadedAt: 'x', readyAt: null, joinedAt: 'x',
    });
    expect(created).toBe(true);
    expect((await repository.findByCode('ABC234'))?.room).toEqual(expect.objectContaining({
      puzzleThemeId: 'museum', effectivePuzzleSeed: 1041,
    }));
    database.close();
  });
});

describe('duel results in the history', () => {
  /** A database with two players, one duel room, and one solo result each. */
  function seeded() {
    const database = new DatabaseSync(':memory:');
    for (const migration of ['0000_logicals_multiplayer', '0001_duel_progress']) {
      database.exec(readFileSync(`drizzle/${migration}.sql`, 'utf8')
        .replaceAll('--> statement-breakpoint', ''));
    }
    database.exec(`
      INSERT INTO players (id, display_name, normalized_name, created_at)
      VALUES (1, 'Ada', 'ada', 'x'), (2, 'Bo', 'bo', 'x');
      INSERT INTO rooms (
        id, code, host_player_id, configuration_json, booklet_seed, puzzle_index,
        puzzle_fingerprint, puzzle_title, puzzle_theme_id, effective_puzzle_seed,
        state, starts_at, expires_at, created_at
      ) VALUES (
        5, 'ABC234', 1, '{}', 41, 0, 'f', 'Museum', 'museum', 41,
        'complete', '2026-09-18T00:00:00Z', '2026-09-19T00:00:00Z', '2026-09-18T00:00:00Z'
      );
    `);
    const insert = (id: number, playerId: number, roomId: number | null, elapsed: number, checks: number, at: string) =>
      database.exec(`
        INSERT INTO results (
          id, player_id, room_id, attempt_key, puzzle_fingerprint, puzzle_title,
          theme_id, difficulty, seed, configuration_json, elapsed_ms, failed_checks, completed_at
        ) VALUES (
          ${id}, ${playerId}, ${roomId === null ? 'NULL' : roomId}, 'k${id}', 'f', 'Museum',
          'museum', 'mittel', 41, '{}', ${elapsed}, ${checks}, '${at}'
        );
      `);
    insert(1, 1, 5, 61_000, 2, '2026-09-18T01:00:00Z');   // Ada, in the duel
    insert(2, 2, 5, 75_000, 4, '2026-09-18T01:01:00Z');   // Bo, same duel
    insert(3, 1, null, 50_000, 0, '2026-09-18T02:00:00Z'); // Ada, solo
    return database;
  }

  it('carries the opponent alongside a duel result', async () => {
    const repository = createResultsRepository(adapter(seeded()));
    const rows = await repository.listByPlayer(1, 50) as any[];

    const duel = rows.find(row => row.roomId === 5)!;
    expect(duel.opponentName).toBe('Bo');
    expect(duel.opponentElapsedMs).toBe(75_000);
    expect(duel.opponentFailedChecks).toBe(4);
  });

  it('leaves a solo result without an opponent rather than inventing one', async () => {
    const repository = createResultsRepository(adapter(seeded()));
    const rows = await repository.listByPlayer(1, 50) as any[];

    const solo = rows.find(row => row.roomId === null)!;
    expect(solo.opponentName ?? null).toBeNull();
    expect(solo.opponentElapsedMs ?? null).toBeNull();
  });

  it('never joins a player to their own result', async () => {
    const repository = createResultsRepository(adapter(seeded()));
    for (const row of await repository.listByPlayer(1, 50) as any[]) {
      expect(row.opponentName ?? null).not.toBe('Ada');
    }
  });

  it('returns exactly one row per result, not one per opponent', async () => {
    const repository = createResultsRepository(adapter(seeded()));
    const rows = await repository.listByPlayer(1, 50) as any[];
    // Ada has two results; a careless join would duplicate the duel one.
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map(row => row.id)).size).toBe(2);
  });

  it('shows each side their own opponent', async () => {
    const repository = createResultsRepository(adapter(seeded()));
    const bo = await repository.listByPlayer(2, 50) as any[];
    expect(bo).toHaveLength(1);
    expect(bo[0].opponentName).toBe('Ada');
    expect(bo[0].opponentElapsedMs).toBe(61_000);
  });
});
