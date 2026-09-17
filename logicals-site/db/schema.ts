import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from 'drizzle-orm/sqlite-core';

export const players = sqliteTable('players', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  displayName: text('display_name').notNull(),
  normalizedName: text('normalized_name').notNull().unique(),
  createdAt: text('created_at').notNull(),
});

export const rooms = sqliteTable('rooms', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  code: text('code').notNull().unique(),
  hostPlayerId: integer('host_player_id').notNull().references(() => players.id, { onDelete: 'restrict' }),
  configurationJson: text('configuration_json').notNull(),
  bookletSeed: integer('booklet_seed').notNull(),
  puzzleIndex: integer('puzzle_index').notNull(),
  puzzleFingerprint: text('puzzle_fingerprint').notNull(),
  puzzleTitle: text('puzzle_title').notNull(),
  puzzleThemeId: text('puzzle_theme_id').notNull(),
  effectivePuzzleSeed: integer('effective_puzzle_seed').notNull(),
  state: text('state').notNull(),
  startsAt: text('starts_at'),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull(),
}, table => [
  check('rooms_state_check', sql`${table.state} in ('waiting', 'countdown', 'active', 'complete', 'expired')`),
  index('idx_rooms_expires_at').on(table.expiresAt),
]);

export const roomMembers = sqliteTable('room_members', {
  roomId: integer('room_id').notNull().references(() => rooms.id, { onDelete: 'restrict' }),
  playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'restrict' }),
  role: text('role').notNull(),
  memberTokenHash: text('member_token_hash').notNull(),
  loadedAt: text('loaded_at'),
  readyAt: text('ready_at'),
  joinedAt: text('joined_at').notNull(),
}, table => [
  primaryKey({ columns: [table.roomId, table.playerId] }),
  uniqueIndex('uq_room_member_role').on(table.roomId, table.role),
  uniqueIndex('uq_room_member_token_hash').on(table.memberTokenHash),
  check('room_members_role_check', sql`${table.role} in ('host', 'guest')`),
]);

export const results = sqliteTable('results', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  playerId: integer('player_id').notNull().references(() => players.id, { onDelete: 'restrict' }),
  roomId: integer('room_id').references(() => rooms.id, { onDelete: 'restrict' }),
  attemptKey: text('attempt_key').notNull().unique(),
  puzzleFingerprint: text('puzzle_fingerprint').notNull(),
  puzzleTitle: text('puzzle_title').notNull(),
  themeId: text('theme_id').notNull(),
  difficulty: text('difficulty').notNull(),
  seed: integer('seed').notNull(),
  configurationJson: text('configuration_json').notNull(),
  elapsedMs: integer('elapsed_ms').notNull(),
  failedChecks: integer('failed_checks').notNull(),
  completedAt: text('completed_at').notNull(),
}, table => [
  uniqueIndex('uq_results_room_player').on(table.roomId, table.playerId),
  index('idx_results_player_completed').on(table.playerId, table.completedAt),
]);
