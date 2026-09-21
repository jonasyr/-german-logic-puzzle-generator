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

/*
 * Ein Ergebnis in die Datenbank legen.
 *
 * Lag in `seeded()`, solange nur die Duell-Historie es brauchte. Die Sammlung
 * braucht Zeilen mit eigenen Seeds, deshalb nimmt der Helfer die Datenbank und
 * den Seed entgegen - ein zweiter Einfüge-Helfer daneben wäre eine Quelle für
 * zwei verschiedene Ergebniszeilen.
 */
const insert = (
  database: any, id: number, playerId: number, roomId: number | null,
  elapsed: number, checks: number, at: string, seed = 41, configuration = '{}',
) =>
  database.exec(`
    INSERT INTO results (
      id, player_id, room_id, attempt_key, puzzle_fingerprint, puzzle_title,
      theme_id, difficulty, seed, configuration_json, elapsed_ms, failed_checks, completed_at
    ) VALUES (
      ${id}, ${playerId}, ${roomId === null ? 'NULL' : roomId}, 'k${id}', 'f', 'Museum',
      'museum', 'mittel', ${seed}, '${configuration}', ${elapsed}, ${checks}, '${at}'
    );
  `);

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
  insert(database, 1, 1, 5, 61_000, 2, '2026-09-18T01:00:00Z');   // Ada, in the duel
  insert(database, 2, 2, 5, 75_000, 4, '2026-09-18T01:01:00Z');   // Bo, same duel
  insert(database, 3, 1, null, 50_000, 0, '2026-09-18T02:00:00Z'); // Ada, solo
  return database;
}

describe('duel results in the history', () => {
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

describe('die gelösten Katalog-Seeds', () => {
  it('gibt nur die Seeds aus dem Katalogbereich zurück, jeden einmal', async () => {
    // Der Sammlungs-Bildschirm braucht 120 Zustände, die Ergebnisliste ist bei
    // 100 gedeckelt. Deshalb eine eigene, schmale Abfrage: nur Zahlen.
    const database = seeded();
    insert(database, 10, 1, null, 50_000, 0, '2026-09-18T03:00:00Z', 1_000_001);
    insert(database, 11, 1, null, 50_000, 0, '2026-09-18T03:01:00Z', 42);
    insert(database, 12, 1, null, 50_000, 0, '2026-09-18T03:02:00Z', 1_000_001);
    insert(database, 13, 2, null, 50_000, 0, '2026-09-18T03:03:00Z', 1_000_009);
    const repository = createResultsRepository(adapter(database));

    expect(await repository.listSolvedSeeds(1, 1_000_000)).toEqual([1000001]);
  });

  /*
   * Ein Sammlungsraetsel zaehlt fuer die Sammlung, egal wie es gespielt wurde.
   *
   * Seit das Duell seine Raetsel aus der Sammlung nehmen kann, ist das keine
   * Nebensache mehr: wer ein Kapitel im Wettlauf durchspielt, wuerde sonst
   * nichts davon in seiner Sammlung wiederfinden. Die Abfrage filtert nach
   * Seed, nicht nach Raum - hier festgehalten, damit ein spaeteres
   * "nur Einzelspiel zaehlt" auffliegt, statt still zu wirken.
   */
  it('zaehlt ein im Duell geloestes Katalograetsel mit', async () => {
    const database = seeded();
    // Ein eigener Raum: in Raum 5 der Vorlage haben beide schon gespielt, und
    // je Raum und Spieler gibt es genau ein Ergebnis.
    database.exec(`
      INSERT INTO rooms (
        id, code, host_player_id, configuration_json, booklet_seed, puzzle_index,
        puzzle_fingerprint, puzzle_title, puzzle_theme_id, effective_puzzle_seed,
        state, starts_at, expires_at, created_at
      ) VALUES (
        6, 'DEF345', 1, '{}', 1000003, 0, 'f', 'Museum', 'museum', 1000003,
        'complete', '2026-09-18T03:00:00Z', '2026-09-19T03:00:00Z', '2026-09-18T03:00:00Z'
      );
    `);
    insert(database, 20, 1, 6, 50_000, 0, '2026-09-18T03:00:00Z', 1_000_003);
    insert(database, 21, 2, 6, 61_000, 0, '2026-09-18T03:00:00Z', 1_000_003);
    const repository = createResultsRepository(adapter(database));

    expect(await repository.listSolvedSeeds(1, 1_000_000)).toEqual([1000003]);
    expect(await repository.listSolvedSeeds(2, 1_000_000)).toEqual([1000003]);
  });
});

describe('die Eingaben für die Erfahrung', () => {
  /*
   * Der ganze Grund für diese Abfrage: listByPlayer hält bei 100. Erfahrung
   * soll über alles zählen, sonst sänke sie, sobald ein altes Rätsel hinten
   * aus dem Fenster fällt - und eine Anerkennung, die wieder sinkt, ist
   * keine. Der Test hat deshalb mehr als hundert Zeilen zu zählen.
   */
  it('zählt über ALLE Ergebnisse, nicht nur über die ersten hundert', async () => {
    const database = seeded();
    const repository = createResultsRepository(adapter(database));
    // Von der Vorbelegung ausgehen statt eine Zahl zu raten - sie hat für
    // diesen Spieler mehr als ein Ergebnis, was beim ersten Anlauf auffiel.
    const vorher = (await repository.listExperienceInputs(1)).length;

    const konfiguration = '{"categoryCount":4,"valuesPerCategory":4}';
    for (let index = 0; index < 120; index += 1) {
      insert(database, 100 + index, 1, null, 50_000, 0,
        `2026-09-18T04:${String(index % 60).padStart(2, '0')}:00Z`, 41, konfiguration);
    }

    const inputs = await repository.listExperienceInputs(1);
    expect(inputs).toHaveLength(vorher + 120);
    expect(inputs[0]).toHaveProperty('difficulty');
    expect(inputs[0]).toHaveProperty('failedChecks');
    expect(inputs[0]).toHaveProperty('configurationJson');
  });

  it('liefert für die Statistik alle Zeilen, ungedeckelt', async () => {
    /*
     * Dieselbe Begründung wie bei der Erfahrung: listByPlayer hält bei 100,
     * und eine Statistik über die letzten hundert ist eine andere Aussage als
     * eine über alle. Geprüft wird die Menge UND dass die Felder da sind, die
     * statistics.js und dailyStreak lesen.
     */
    const database = seeded();
    const repository = createResultsRepository(adapter(database));
    const vorher = (await repository.listStatsInputs(1)).length;

    for (let index = 0; index < 120; index += 1) {
      insert(database, 500 + index, 1, null, 50_000, 0,
        `2026-09-18T06:${String(index % 60).padStart(2, '0')}:00Z`);
    }

    const zeilen = await repository.listStatsInputs(1);
    expect(zeilen).toHaveLength(vorher + 120);
    for (const feld of ['difficulty', 'elapsedMs', 'failedChecks', 'completedAt',
      'seed', 'configurationJson', 'roomId']) {
      expect(zeilen[0]).toHaveProperty(feld);
    }
  });

  it('gibt die Ergebnisse anderer Spieler nicht mit aus', async () => {
    const database = seeded();
    const repository = createResultsRepository(adapter(database));
    const vorherAda = (await repository.listExperienceInputs(1)).length;

    // Zwanzig Ergebnisse für Bo dürfen Adas Erfahrung nicht anfassen.
    for (let index = 0; index < 20; index += 1) {
      insert(database, 300 + index, 2, null, 50_000, 0,
        `2026-09-18T05:${String(index % 60).padStart(2, '0')}:00Z`);
    }

    expect(await repository.listExperienceInputs(1)).toHaveLength(vorherAda);
    expect((await repository.listExperienceInputs(2)).length).toBeGreaterThanOrEqual(20);
  });
});
