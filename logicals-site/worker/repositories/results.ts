import type { D1Database } from '../types';

export interface ResultRecord {
  id: number;
  playerId: number;
  roomId: number | null;
  attemptKey: string;
  puzzleFingerprint: string;
  puzzleTitle: string;
  themeId: string;
  difficulty: string;
  seed: number;
  configurationJson: string;
  elapsedMs: number;
  failedChecks: number;
  completedAt: string;
}

export type NewResult = Omit<ResultRecord, 'id'>;

export interface ResultRepository {
  findByAttemptKey(attemptKey: string): Promise<ResultRecord | null>;
  findByRoomPlayer(roomId: number, playerId: number): Promise<ResultRecord | null>;
  insert(input: NewResult): Promise<boolean>;
  listByPlayer(playerId: number, limit: number): Promise<ResultRecord[]>;
  listByRoom(roomId: number): Promise<ResultRecord[]>;
}

const SELECT_COLUMNS = `
  id,
  player_id AS playerId,
  room_id AS roomId,
  attempt_key AS attemptKey,
  puzzle_fingerprint AS puzzleFingerprint,
  puzzle_title AS puzzleTitle,
  theme_id AS themeId,
  difficulty,
  seed,
  configuration_json AS configurationJson,
  elapsed_ms AS elapsedMs,
  failed_checks AS failedChecks,
  completed_at AS completedAt
`;

export function createResultsRepository(db: D1Database): ResultRepository {
  return {
    findByAttemptKey(attemptKey) {
      return db.prepare(`
        SELECT ${SELECT_COLUMNS}
        FROM results
        WHERE attempt_key = ?
      `).bind(attemptKey).first<ResultRecord>();
    },

    findByRoomPlayer(roomId, playerId) {
      return db.prepare(`
        SELECT ${SELECT_COLUMNS}
        FROM results
        WHERE room_id = ? AND player_id = ?
      `).bind(roomId, playerId).first<ResultRecord>();
    },

    async insert(input) {
      const result = await db.prepare(`
        INSERT INTO results (
          player_id, room_id, attempt_key, puzzle_fingerprint, puzzle_title,
          theme_id, difficulty, seed, configuration_json, elapsed_ms,
          failed_checks, completed_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT DO NOTHING
      `).bind(
        input.playerId,
        input.roomId,
        input.attemptKey,
        input.puzzleFingerprint,
        input.puzzleTitle,
        input.themeId,
        input.difficulty,
        input.seed,
        input.configurationJson,
        input.elapsedMs,
        input.failedChecks,
        input.completedAt,
      ).run();
      return (result.meta?.changes ?? 0) > 0;
    },

    async listByPlayer(playerId, limit) {
      const result = await db.prepare(`
        SELECT ${SELECT_COLUMNS}
        FROM results
        WHERE player_id = ?
        ORDER BY completed_at DESC, id DESC
        LIMIT ?
      `).bind(playerId, limit).all<ResultRecord>();
      return result.results ?? [];
    },

    async listByRoom(roomId) {
      const result = await db.prepare(`
        SELECT ${SELECT_COLUMNS}
        FROM results
        WHERE room_id = ?
        ORDER BY completed_at ASC, id ASC
      `).bind(roomId).all<ResultRecord>();
      return result.results ?? [];
    },
  };
}
