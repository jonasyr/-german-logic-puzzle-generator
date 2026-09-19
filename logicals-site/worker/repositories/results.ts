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
  /** Present only on duel rows, and only once the opponent has finished. */
  opponentName?: string | null;
  opponentElapsedMs?: number | null;
  opponentFailedChecks?: number | null;
}

export type NewResult = Omit<ResultRecord, 'id'>;

export interface ResultRepository {
  findByAttemptKey(attemptKey: string): Promise<ResultRecord | null>;
  findByRoomPlayer(roomId: number, playerId: number): Promise<ResultRecord | null>;
  insert(input: NewResult): Promise<boolean>;
  listByPlayer(playerId: number, limit: number): Promise<ResultRecord[]>;
  listByRoom(roomId: number): Promise<ResultRecord[]>;
  /**
   * Die Seeds, die dieser Spieler aus dem Katalogbereich gelöst hat.
   *
   * Eigene Abfrage statt listByPlayer, weil die Sammlung 120 Zustände braucht
   * und die Ergebnisliste bei 100 gedeckelt ist - und weil hier nur Zahlen
   * gebraucht werden, keine Ergebniszeilen.
   */
  listSolvedSeeds(playerId: number, minSeed: number): Promise<number[]>;
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
      /*
       * The opponent comes along for duel rows.
       *
       * A room holds exactly two members and results carry a unique
       * (room_id, player_id) index, so this join can match at most one row and
       * cannot duplicate a result. `results.room_id IS NOT NULL` keeps solo rows
       * out of it entirely rather than relying on the player comparison alone.
       */
      const result = await db.prepare(`
        SELECT
          r.id,
          r.player_id AS playerId,
          r.room_id AS roomId,
          r.attempt_key AS attemptKey,
          r.puzzle_fingerprint AS puzzleFingerprint,
          r.puzzle_title AS puzzleTitle,
          r.theme_id AS themeId,
          r.difficulty,
          r.seed,
          r.configuration_json AS configurationJson,
          r.elapsed_ms AS elapsedMs,
          r.failed_checks AS failedChecks,
          r.completed_at AS completedAt,
          op.display_name AS opponentName,
          o.elapsed_ms AS opponentElapsedMs,
          o.failed_checks AS opponentFailedChecks
        FROM results r
        LEFT JOIN results o
          ON r.room_id IS NOT NULL AND o.room_id = r.room_id AND o.player_id <> r.player_id
        LEFT JOIN players op ON op.id = o.player_id
        WHERE r.player_id = ?
        ORDER BY r.completed_at DESC, r.id DESC
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

    async listSolvedSeeds(playerId, minSeed) {
      const { results } = await db.prepare(`
        SELECT DISTINCT seed FROM results
        WHERE player_id = ? AND seed >= ?
        ORDER BY seed
      `).bind(playerId, minSeed).all<{ seed: number }>();
      return (results ?? []).map(row => row.seed);
    },
  };
}
