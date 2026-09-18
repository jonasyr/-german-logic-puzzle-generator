import type { D1Database } from '../types';

export type RoomState = 'waiting' | 'countdown' | 'active' | 'complete' | 'expired';

export interface RoomRecord {
  id: number;
  code: string;
  hostPlayerId: number;
  configurationJson: string;
  bookletSeed: number;
  puzzleIndex: number;
  puzzleFingerprint: string;
  puzzleTitle: string;
  puzzleThemeId: string;
  effectivePuzzleSeed: number;
  state: RoomState;
  startsAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface RoomMemberRecord {
  roomId: number;
  playerId: number;
  displayName: string;
  role: 'host' | 'guest';
  memberTokenHash: string;
  loadedAt: string | null;
  readyAt: string | null;
  /** Cells filled, reported by the client and clamped by the service. */
  progressFilled: number | null;
  progressAt: string | null;
  joinedAt: string;
}

export interface RoomAggregate {
  room: RoomRecord;
  members: RoomMemberRecord[];
}

export interface NewRoom extends Omit<RoomRecord, 'id'> {}
/** A member joins with no progress; the columns start NULL. */
export interface NewRoomMember
  extends Omit<RoomMemberRecord, 'roomId' | 'displayName' | 'progressFilled' | 'progressAt'> {}

export interface RoomRepository {
  create(room: NewRoom, host: NewRoomMember): Promise<boolean>;
  findByCode(code: string): Promise<RoomAggregate | null>;
  findById(id: number): Promise<RoomAggregate | null>;
  tryJoin(code: string, member: NewRoomMember, fingerprint: string, now: string): Promise<boolean>;
  markLoaded(code: string, playerId: number, tokenHash: string, now: string): Promise<boolean>;
  markReady(code: string, playerId: number, tokenHash: string, now: string): Promise<boolean>;
  recordProgress(
    code: string, playerId: number, tokenHash: string, filled: number, now: string,
  ): Promise<boolean>;
  tryStart(code: string, startsAt: string, now: string): Promise<boolean>;
  markActive(code: string, now: string): Promise<void>;
  markExpired(code: string, now: string): Promise<void>;
  markComplete(roomId: number): Promise<void>;
}

const ROOM_COLUMNS = `
  id, code, host_player_id AS hostPlayerId,
  configuration_json AS configurationJson, booklet_seed AS bookletSeed,
  puzzle_index AS puzzleIndex, puzzle_fingerprint AS puzzleFingerprint,
  puzzle_title AS puzzleTitle, puzzle_theme_id AS puzzleThemeId,
  effective_puzzle_seed AS effectivePuzzleSeed, state, starts_at AS startsAt,
  expires_at AS expiresAt, created_at AS createdAt
`;

const MEMBER_COLUMNS = `
  rm.room_id AS roomId, rm.player_id AS playerId,
  p.display_name AS displayName, rm.role,
  rm.member_token_hash AS memberTokenHash,
  rm.loaded_at AS loadedAt, rm.ready_at AS readyAt,
  rm.progress_filled AS progressFilled, rm.progress_at AS progressAt,
  rm.joined_at AS joinedAt
`;

export function createRoomsRepository(db: D1Database): RoomRepository {
  return {
    async create(room, host) {
      const results = await db.batch([
        db.prepare(`
          INSERT INTO rooms (
            code, host_player_id, configuration_json, booklet_seed, puzzle_index,
            puzzle_fingerprint, puzzle_title, puzzle_theme_id, effective_puzzle_seed,
            state, starts_at, expires_at, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(code) DO NOTHING
        `).bind(
          room.code, room.hostPlayerId, room.configurationJson, room.bookletSeed,
          room.puzzleIndex, room.puzzleFingerprint, room.puzzleTitle,
          room.puzzleThemeId, room.effectivePuzzleSeed, room.state,
          room.startsAt, room.expiresAt, room.createdAt,
        ),
        db.prepare(`
          INSERT INTO room_members (
            room_id, player_id, role, member_token_hash, loaded_at, ready_at, joined_at
          )
          SELECT id, ?, ?, ?, ?, ?, ? FROM rooms
          WHERE code = ? AND host_player_id = ? AND created_at = ? AND puzzle_fingerprint = ?
          ON CONFLICT DO NOTHING
        `).bind(
          host.playerId, host.role, host.memberTokenHash, host.loadedAt,
          host.readyAt, host.joinedAt, room.code, room.hostPlayerId,
          room.createdAt, room.puzzleFingerprint,
        ),
      ]);
      return (results[0]?.meta?.changes ?? 0) === 1 && (results[1]?.meta?.changes ?? 0) === 1;
    },

    async findByCode(code) {
      const room = await db.prepare(`
        SELECT ${ROOM_COLUMNS} FROM rooms WHERE code = ?
      `).bind(code).first<RoomRecord>();
      if (!room) return null;
      const members = await db.prepare(`
        SELECT ${MEMBER_COLUMNS}
        FROM room_members rm
        JOIN players p ON p.id = rm.player_id
        WHERE rm.room_id = ?
        ORDER BY CASE rm.role WHEN 'host' THEN 0 ELSE 1 END
      `).bind(room.id).all<RoomMemberRecord>();
      return { room, members: members.results ?? [] };
    },

    async findById(id) {
      const room = await db.prepare(`
        SELECT ${ROOM_COLUMNS} FROM rooms WHERE id = ?
      `).bind(id).first<RoomRecord>();
      if (!room) return null;
      const members = await db.prepare(`
        SELECT ${MEMBER_COLUMNS}
        FROM room_members rm
        JOIN players p ON p.id = rm.player_id
        WHERE rm.room_id = ?
        ORDER BY CASE rm.role WHEN 'host' THEN 0 ELSE 1 END
      `).bind(room.id).all<RoomMemberRecord>();
      return { room, members: members.results ?? [] };
    },

    async tryJoin(code, member, fingerprint, now) {
      const result = await db.prepare(`
        INSERT INTO room_members (
          room_id, player_id, role, member_token_hash, loaded_at, ready_at, joined_at
        )
        SELECT r.id, ?, 'guest', ?, ?, NULL, ?
        FROM rooms r
        WHERE r.code = ?
          AND r.state = 'waiting'
          AND r.starts_at IS NULL
          AND r.expires_at > ?
          AND r.puzzle_fingerprint = ?
          AND r.host_player_id <> ?
          AND NOT EXISTS (
            SELECT 1 FROM room_members existing
            WHERE existing.room_id = r.id AND (existing.role = 'guest' OR existing.player_id = ?)
          )
        ON CONFLICT DO NOTHING
      `).bind(
        member.playerId, member.memberTokenHash, member.loadedAt, member.joinedAt,
        code, now, fingerprint, member.playerId, member.playerId,
      ).run();
      return (result.meta?.changes ?? 0) === 1;
    },

    async markLoaded(code, playerId, tokenHash, now) {
      const result = await db.prepare(`
        UPDATE room_members
        SET loaded_at = COALESCE(loaded_at, ?)
        WHERE player_id = ? AND member_token_hash = ?
          AND room_id = (
            SELECT id FROM rooms
            WHERE code = ? AND expires_at > ? AND state IN ('waiting', 'countdown', 'active')
          )
      `).bind(now, playerId, tokenHash, code, now).run();
      return (result.meta?.changes ?? 0) > 0;
    },

    async markReady(code, playerId, tokenHash, now) {
      const result = await db.prepare(`
        UPDATE room_members
        SET ready_at = COALESCE(ready_at, ?)
        WHERE player_id = ? AND member_token_hash = ? AND loaded_at IS NOT NULL
          AND room_id = (
            SELECT id FROM rooms
            WHERE code = ? AND expires_at > ? AND state IN ('waiting', 'countdown', 'active')
          )
      `).bind(now, playerId, tokenHash, code, now).run();
      return (result.meta?.changes ?? 0) > 0;
    },

    async recordProgress(code, playerId, tokenHash, filled, now) {
      // Only for a member of a room that is actually being played, and the
      // token has to match - the same bar the ready and loaded updates clear.
      const result = await db.prepare(`
        UPDATE room_members
        SET progress_filled = ?, progress_at = ?
        WHERE player_id = ? AND member_token_hash = ?
          AND room_id = (
            SELECT id FROM rooms
            WHERE code = ? AND expires_at > ? AND state IN ('countdown', 'active')
          )
      `).bind(filled, now, playerId, tokenHash, code, now).run();
      return (result.meta?.changes ?? 0) > 0;
    },

    async tryStart(code, startsAt, now) {
      const result = await db.prepare(`
        UPDATE rooms
        SET state = 'countdown', starts_at = ?
        WHERE code = ? AND state = 'waiting' AND starts_at IS NULL AND expires_at > ?
          AND 2 = (
            SELECT COUNT(DISTINCT player_id) FROM room_members
            WHERE room_id = rooms.id AND loaded_at IS NOT NULL AND ready_at IS NOT NULL
          )
      `).bind(startsAt, code, now).run();
      return (result.meta?.changes ?? 0) === 1;
    },

    async markActive(code, now) {
      await db.prepare(`
        UPDATE rooms SET state = 'active'
        WHERE code = ? AND state = 'countdown' AND starts_at <= ?
      `).bind(code, now).run();
    },

    async markExpired(code, now) {
      await db.prepare(`
        UPDATE rooms SET state = 'expired'
        WHERE code = ? AND expires_at <= ? AND state <> 'complete'
      `).bind(code, now).run();
    },

    async markComplete(roomId) {
      await db.prepare(`
        UPDATE rooms SET state = 'complete'
        WHERE id = ? AND state IN ('countdown', 'active')
      `).bind(roomId).run();
    },
  };
}
