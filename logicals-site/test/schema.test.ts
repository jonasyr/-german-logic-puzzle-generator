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

  it('adds duel progress on top of the migration already in production', () => {
    // 0000 is deployed, so this has to APPLY OVER it rather than replace it -
    // and it has to be two nullable ADD COLUMNs, because a table rebuild on a
    // live rooms table is a different class of risk entirely.
    const database = new DatabaseSync(':memory:');
    const strip = (file: string) =>
      readFileSync(file, 'utf8').replaceAll('--> statement-breakpoint', '');
    database.exec(strip('drizzle/0000_logicals_multiplayer.sql'));
    database.exec(strip('drizzle/0001_duel_progress.sql'));

    const columns = database.prepare('PRAGMA table_info(room_members)').all() as Array<{
      name: string; notnull: number;
    }>;
    const added = columns.filter(column => column.name.startsWith('progress_'));
    expect(added.map(column => column.name).sort()).toEqual(['progress_at', 'progress_filled']);
    // Nullable, so rooms created before the column existed stay valid.
    expect(added.every(column => column.notnull === 0)).toBe(true);

    const sql = readFileSync('drizzle/0001_duel_progress.sql', 'utf8');
    expect(sql).toContain('ADD `progress_filled` integer');
    expect(sql).toContain('ADD `progress_at` text');
    expect(sql).not.toContain('CREATE TABLE');   // no rebuild of a live table
    database.close();
  });

  it('stores canonical duel metadata in the first unpublished migration', () => {
    const sql = readFileSync('drizzle/0000_logicals_multiplayer.sql', 'utf8');
    expect(sql).toContain('`puzzle_title` text NOT NULL');
    expect(sql).toContain('`puzzle_theme_id` text NOT NULL');
    expect(sql).toContain('`effective_puzzle_seed` integer NOT NULL');
  });
});
