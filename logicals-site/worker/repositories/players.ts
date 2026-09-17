import type { D1Database } from '../types';

export interface Player {
  id: number;
  displayName: string;
  normalizedName: string;
  createdAt: string;
}

export interface PlayerRepository {
  list(): Promise<Player[]>;
  findByNormalizedName(normalizedName: string): Promise<Player | null>;
  create(displayName: string, normalizedName: string, createdAt: string): Promise<boolean>;
}

const SELECT_COLUMNS = `
  id,
  display_name AS displayName,
  normalized_name AS normalizedName,
  created_at AS createdAt
`;

export function createPlayersRepository(db: D1Database): PlayerRepository {
  return {
    async list() {
      const result = await db.prepare(`
        SELECT ${SELECT_COLUMNS}
        FROM players
        ORDER BY normalized_name ASC
      `).all<Player>();
      return result.results ?? [];
    },

    findByNormalizedName(normalizedName) {
      return db.prepare(`
        SELECT ${SELECT_COLUMNS}
        FROM players
        WHERE normalized_name = ?
      `).bind(normalizedName).first<Player>();
    },

    async create(displayName, normalizedName, createdAt) {
      const result = await db.prepare(`
        INSERT INTO players (display_name, normalized_name, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(normalized_name) DO NOTHING
      `).bind(displayName, normalizedName, createdAt).run();
      return (result.meta?.changes ?? 0) > 0;
    },
  };
}
