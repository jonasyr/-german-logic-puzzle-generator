import { readFileSync } from 'node:fs';
// Node 24 provides this stable module; the pinned @types/node release predates it.
// @ts-expect-error runtime module is available in the test image
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';
import { createRoomsRepository } from '../worker/repositories/rooms';
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
