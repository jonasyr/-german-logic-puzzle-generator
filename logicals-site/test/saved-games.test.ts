import { describe, expect, it } from 'vitest';
import { listSavedGames, readSavedGame } from '../client/js/play/savedGames.js';

/**
 * Ein Speicher, wie ihn Node nicht hat.
 *
 * `length` und `key(i)` sind der Teil der Storage-Schnittstelle, den das
 * Durchgehen braucht - ohne sie kaeme man an die Schluessel gar nicht heran.
 */
function storageWith(entries: Record<string, string>) {
    const keys = Object.keys(entries);
    return {
        get length() { return keys.length; },
        key: (index: number) => keys[index] ?? null,
        getItem: (key: string) => entries[key] ?? null,
        setItem: () => {},
        removeItem: (key: string) => { delete entries[key]; keys.splice(keys.indexOf(key), 1); },
    } as unknown as Storage;
}

const WERT = JSON.stringify({ marks: [], auto: [], usedClues: [], elapsedMs: 0, solved: false });

describe('die gespeicherten Einzelspiele', () => {
    it('zerlegt den Schluessel in seine Bestandteile', () => {
        const speicher = storageWith({
            'logicals:play:solo:none:1:museum:1000003:5x5:a1b2': WERT,
        });
        expect(listSavedGames(1, speicher)).toEqual([{
            key: 'logicals:play:solo:none:1:museum:1000003:5x5:a1b2',
            themeId: 'museum', seed: 1_000_003,
            categoryCount: 5, valuesPerCategory: 5,
        }]);
    });

    it('laesst Duell-Staende liegen', () => {
        /*
         * Ein Duell-Stand gehoert zu einem Raum, der laengst abgelaufen sein
         * kann. In der Sammlung hat er nichts zu suchen.
         */
        const speicher = storageWith({
            'logicals:play:duel:ABC234:1:museum:1000003:5x5:a1b2': WERT,
        });
        expect(listSavedGames(1, speicher)).toEqual([]);
    });

    it('laesst fremde Spieler liegen', () => {
        const speicher = storageWith({
            'logicals:play:solo:none:2:museum:1000003:5x5:a1b2': WERT,
        });
        expect(listSavedGames(1, speicher)).toEqual([]);
    });

    it('uebergeht alles, was nicht wie ein Spielstand aussieht', () => {
        const speicher = storageWith({
            'logicals.prefs.v1': '{}',
            'logicals:play:solo:none:1:museum:kaputt': WERT,
        });
        expect(listSavedGames(1, speicher)).toEqual([]);
    });

    it('faellt bei gesperrtem Speicher auf eine leere Liste zurueck', () => {
        const gesperrt = {
            get length(): number { throw new Error('SecurityError'); },
            key: () => null, getItem: () => null, setItem: () => {}, removeItem: () => {},
        } as unknown as Storage;
        expect(listSavedGames(1, gesperrt)).toEqual([]);
    });
});

const KEY = 'logicals:play:solo:none:1:museum:1000003:3x4:a1b2';

function standMit(marks: Array<[string, string]>, extra: object = {}) {
    return JSON.stringify({
        marks, auto: [['0.1.2.2', ['0.1.0.0']]], usedClues: [1],
        elapsedMs: 61_000, solved: false, attemptKey: null,
        failedChecks: 0, resultQueued: false, ...extra,
    });
}

describe('ein gelesener Stand', () => {
    it('zaehlt nur sichere Zuordnungen', () => {
        /*
         * `no` und `maybe` sind Arbeit, aber keine Festlegung. Automatische
         * Kreuze liegen ohnehin in `auto` und nicht in `marks` - ein Anteil
         * an allen gesetzten Zellen erreichte deshalb nie 100 %.
         */
        const stand = readSavedGame(KEY, storageWith({
            [KEY]: standMit([['0.1.0.0', 'yes'], ['0.1.1.1', 'no'],
                             ['0.2.0.0', 'maybe'], ['1.2.3.3', 'yes']]),
        }));
        expect(stand?.sure).toBe(2);
        expect(stand?.marks).toBe(4);
    });

    it('rechnet die Bezugsgroesse aus den Maszen im Schluessel', () => {
        // 3 Kategorien, 4 Werte: 4 * C(3,2) = 12.
        const stand = readSavedGame(KEY, storageWith({ [KEY]: standMit([]) }));
        expect(stand?.total).toBe(12);

        const grosz = 'logicals:play:solo:none:1:museum:1000003:5x5:a1b2';
        // 5 Kategorien, 5 Werte: 5 * C(5,2) = 50.
        expect(readSavedGame(grosz, storageWith({ [grosz]: standMit([]) }))?.total).toBe(50);
    });

    it('reicht die Angaben durch, die ein Stand ueber sich selbst traegt', () => {
        const stand = readSavedGame(KEY, storageWith({
            [KEY]: standMit([['0.1.0.0', 'yes']], {
                options: { seed: 1_000_003, categoryCount: 3, valuesPerCategory: 4 },
                fingerprint: 'abc123', title: '3. Museum bei Nacht',
                savedAt: '2026-09-22T10:00:00.000Z', solved: true,
            }),
        }));
        expect(stand?.options).toEqual({ seed: 1_000_003, categoryCount: 3, valuesPerCategory: 4 });
        expect(stand?.fingerprint).toBe('abc123');
        expect(stand?.title).toBe('3. Museum bei Nacht');
        expect(stand?.savedAt).toBe('2026-09-22T10:00:00.000Z');
        expect(stand?.solved).toBe(true);
        expect(stand?.elapsedMs).toBe(61_000);
    });

    it('gibt null zurueck statt zu werfen', () => {
        // Ein Stand aus einer aelteren Fassung hat diese Felder nicht.
        const alt = readSavedGame(KEY, storageWith({ [KEY]: standMit([]) }));
        expect(alt?.options).toBeNull();
        expect(alt?.fingerprint).toBeNull();
        expect(alt?.savedAt).toBeNull();

        expect(readSavedGame(KEY, storageWith({ [KEY]: 'kein json' }))).toBeNull();
        expect(readSavedGame(KEY, storageWith({}))).toBeNull();
        expect(readSavedGame('logicals.prefs.v1', storageWith({ 'logicals.prefs.v1': '{}' }))).toBeNull();
    });
});
