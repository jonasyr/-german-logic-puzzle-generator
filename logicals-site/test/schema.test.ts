import { readFileSync } from 'node:fs';
// Node 24 provides this stable module; the pinned @types/node release predates it.
// @ts-expect-error runtime module is available in the test image
import { DatabaseSync } from 'node:sqlite';
import { describe, expect, it } from 'vitest';

describe('D1 migration', () => {
  it('applies cleanly to SQLite as the first production migration', () => {
    const database = new DatabaseSync(':memory:');
    const sql = readFileSync('drizzle/0000_logicals_multiplayer.sql', 'utf8')
      .replaceAll('--> statement-breakpoint', '');
    database.exec(sql);
    const columns = database.prepare('PRAGMA table_info(rooms)').all()
      .map((column: unknown) => (column as { name: string }).name);
    expect(columns).toEqual(expect.arrayContaining([
      'puzzle_title', 'puzzle_theme_id', 'effective_puzzle_seed',
    ]));
    database.close();
  });

  it('creates durable player, room, membership, and result records', () => {
    const sql = readFileSync('drizzle/0000_logicals_multiplayer.sql', 'utf8');
    for (const table of ['players', 'rooms', 'room_members', 'results']) {
      expect(sql).toContain(`CREATE TABLE \`${table}\``);
    }
    expect(sql).toContain('normalized_name');
    expect(sql).toContain('member_token_hash');
    expect(sql).toContain('attempt_key');
    expect(sql).toContain('UNIQUE');
  });

  it('indexes history and room expiry query paths', () => {
    const sql = readFileSync('drizzle/0000_logicals_multiplayer.sql', 'utf8');
    expect(sql).toContain('idx_results_player_completed');
    expect(sql).toContain('idx_rooms_expires_at');
  });

  it('stores canonical duel metadata in the first unpublished migration', () => {
    const sql = readFileSync('drizzle/0000_logicals_multiplayer.sql', 'utf8');
    expect(sql).toContain('`puzzle_title` text NOT NULL');
    expect(sql).toContain('`puzzle_theme_id` text NOT NULL');
    expect(sql).toContain('`effective_puzzle_seed` integer NOT NULL');
  });
});
