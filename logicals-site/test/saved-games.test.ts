import { describe, expect, it } from 'vitest';
import {
    listSavedGames, newestSavedGame, parseSavedKey, pruneSavedGames, readSavedGame,
} from '../client/js/play/savedGames.js';
import { save } from '../client/js/play/playState.js';

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

function standFuer(seed: number, savedAt: string | null, extra: object = {}) {
    return [
        `logicals:play:solo:none:1:museum:${seed}:3x4:h${seed}`,
        JSON.stringify({
            marks: [['0.1.0.0', 'yes']], auto: [], usedClues: [],
            elapsedMs: 1000, solved: false,
            options: { seed, categoryCount: 3, valuesPerCategory: 4 },
            fingerprint: `f${seed}`, title: `${seed}. Museum`,
            ...(savedAt ? { savedAt } : {}), ...extra,
        }),
    ] as const;
}

describe('der juengste Stand', () => {
    it('nimmt den mit der spaetesten Zeitmarke', () => {
        const [a, aw] = standFuer(1, '2026-09-20T10:00:00.000Z');
        const [b, bw] = standFuer(2, '2026-09-22T10:00:00.000Z');
        expect(newestSavedGame(1, storageWith({ [a]: aw, [b]: bw }))?.seed).toBe(2);
    });

    it('uebergeht geloeste und leere Staende', () => {
        /*
         * Beides ist nichts, wozu man zurueckkommt: ein geloestes Raetsel ist
         * fertig, ein leeres hat nichts zu zeigen.
         */
        const [a, aw] = standFuer(1, '2026-09-22T10:00:00.000Z', { solved: true });
        const [b, bw] = standFuer(2, '2026-09-21T10:00:00.000Z', { marks: [] });
        const [c, cw] = standFuer(3, '2026-09-20T10:00:00.000Z');
        expect(newestSavedGame(1, storageWith({ [a]: aw, [b]: bw, [c]: cw }))?.seed).toBe(3);
    });

    it('uebergeht Staende, die sich nicht wiederherstellen lassen', () => {
        // Ohne Einstellungen und Fingerabdruck fuehrt der Knopf ins Nichts -
        // schlimmer als kein Knopf.
        const [a, aw] = standFuer(1, '2026-09-22T10:00:00.000Z',
            { options: null, fingerprint: null });
        const [b, bw] = standFuer(2, '2026-09-21T10:00:00.000Z');
        expect(newestSavedGame(1, storageWith({ [a]: aw, [b]: bw }))?.seed).toBe(2);
    });

    it('gibt null zurueck, wenn nichts in Frage kommt', () => {
        expect(newestSavedGame(1, storageWith({}))).toBeNull();
    });
});

describe('die Obergrenze', () => {
    it('wirft den aeltesten weg und behaelt den juengsten', () => {
        const [a, aw] = standFuer(1, '2026-09-20T10:00:00.000Z');
        const [b, bw] = standFuer(2, '2026-09-21T10:00:00.000Z');
        const [c, cw] = standFuer(3, '2026-09-22T10:00:00.000Z');
        const speicher = storageWith({ [a]: aw, [b]: bw, [c]: cw });

        expect(pruneSavedGames(1, 2, speicher)).toBe(1);
        expect(listSavedGames(1, speicher).map(stand => stand.seed).sort()).toEqual([2, 3]);
    });

    it('haelt einen Stand ohne Zeitmarke fuer den aeltesten', () => {
        // Er stammt aus einer Fassung, die noch keine schrieb.
        const [a, aw] = standFuer(1, null);
        const [b, bw] = standFuer(2, '2026-09-20T10:00:00.000Z');
        const speicher = storageWith({ [a]: aw, [b]: bw });

        pruneSavedGames(1, 1, speicher);
        expect(listSavedGames(1, speicher).map(stand => stand.seed)).toEqual([2]);
    });

    it('raeumt nicht auf, solange Platz ist', () => {
        const [a, aw] = standFuer(1, '2026-09-20T10:00:00.000Z');
        const speicher = storageWith({ [a]: aw });
        expect(pruneSavedGames(1, 200, speicher)).toBe(0);
        expect(listSavedGames(1, speicher)).toHaveLength(1);
    });
});

/*
 * Was eine gegnerische Durchsicht gefunden hat.
 *
 * Alles hier stammt aus einem Bericht, nicht aus einem Einfall: jeder Fall
 * war ein Weg, auf dem entweder etwas geworfen haette oder der Filter mehr
 * Strenge versprach, als er leistete.
 */
describe('die Raender', () => {
    it('wirft nicht, wenn marks keine Paarliste ist', () => {
        /*
         * `marks.filter(([, mark]) => ...)` zerlegte jedes Element. Ein Wert
         * wie {"marks":[null]} warf damit einen TypeError - und weder das
         * Suchen des juengsten Standes noch das Aufraeumen haben ein try,
         * also riss ein einziger verfaelschter Eintrag das Oeffnen mit.
         */
        for (const kaputt of ['{"marks":[1,2]}', '{"marks":[null]}', '{"marks":"nein"}']) {
            const stand = readSavedGame(KEY, storageWith({ [KEY]: kaputt }));
            expect(stand?.sure).toBe(0);
        }
    });

    it('laesst einen verfaelschten Eintrag das Aufraeumen nicht mitreissen', () => {
        const [a, aw] = standFuer(1, '2026-09-20T10:00:00.000Z');
        const kaputt = 'logicals:play:solo:none:1:museum:2:3x4:h2';
        const [c, cw] = standFuer(3, '2026-09-22T10:00:00.000Z');
        const speicher = storageWith({ [a]: aw, [kaputt]: '{"marks":[null]}', [c]: cw });

        expect(() => pruneSavedGames(1, 2, speicher)).not.toThrow();
        expect(() => newestSavedGame(1, speicher)).not.toThrow();
    });

    it('laesst Staende ohne Spielernummer liegen', () => {
        // storageKeyFor faellt auf 'anonymous' zurueck, wenn kein Spieler
        // ausgewaehlt ist. Solche Staende gehoeren niemandem.
        const speicher = storageWith({
            'logicals:play:solo:none:anonymous:museum:1000003:3x4:a1b2': WERT,
        });
        expect(listSavedGames(1, speicher)).toEqual([]);
    });

    it('nimmt nur Ziffern als Seed und Spieler', () => {
        // Number() naehme auch '1e3', '0x10' und den leeren String.
        for (const key of [
            'logicals:play:solo:none:1:museum::3x4:a1b2',
            'logicals:play:solo:none:1:museum:1e3:3x4:a1b2',
            'logicals:play:solo:none:1:museum:0x10:3x4:a1b2',
            'logicals:play:solo:none:1:museum:1000003:3x4x9:a1b2',
        ]) {
            expect(parseSavedKey(key), key).toBeNull();
        }
    });

    it('nimmt keinen Schluessel mit zu vielen Teilen', () => {
        expect(parseSavedKey('logicals:play:solo:none:1:museum:7:3x4:a1b2:zuviel')).toBeNull();
    });

    it('vertraegt ein null mitten in der Schluesselliste', () => {
        // Die echte Storage-Schnittstelle darf das; die Attrappe tat es nie.
        const loechrig = {
            length: 2,
            key: (index: number) => (index === 0
                ? null
                : 'logicals:play:solo:none:1:museum:1000003:3x4:a1b2'),
            getItem: () => WERT, setItem: () => {}, removeItem: () => {},
        } as unknown as Storage;
        expect(listSavedGames(1, loechrig)).toHaveLength(1);
    });

    it('raeumt bei limit 0 alles weg', () => {
        // Festgehalten, weil es vertretbar, aber nicht offensichtlich ist.
        const [a, aw] = standFuer(1, '2026-09-20T10:00:00.000Z');
        const speicher = storageWith({ [a]: aw });
        expect(pruneSavedGames(1, 0, speicher)).toBe(1);
        expect(listSavedGames(1, speicher)).toEqual([]);
    });
});

/** Ein Speicher, in den auch geschrieben werden kann. */
function schreibbarerSpeicher(entries: Record<string, string> = {}) {
    return {
        get length() { return Object.keys(entries).length; },
        key: (index: number) => Object.keys(entries)[index] ?? null,
        getItem: (key: string) => entries[key] ?? null,
        setItem: (key: string, value: string) => { entries[key] = value; },
        removeItem: (key: string) => { delete entries[key]; },
    } as unknown as Storage;
}

function zustand(marks: Array<[string, string]>, extra: object = {}) {
    return {
        storageKey: KEY,
        marks: new Map(marks), auto: new Map(), usedClues: new Set<number>(),
        solved: false, attemptKey: null, failedChecks: 0, resultQueued: false,
        context: {
            options: { seed: 1_000_003, categoryCount: 3, valuesPerCategory: 4 },
            puzzleIndex: 0,
        },
        ...extra,
    };
}

describe('was beim Speichern mitgeschrieben wird', () => {
    it('traegt Einstellungen, Fingerabdruck, Titel, Nummer und Zeitmarke', () => {
        /*
         * Ohne diese Felder ist ein Stand nur wiederfindbar, solange der eine
         * Fortsetzungs-Platz auf ihn zeigt - und der wird vom naechsten
         * Raetsel ueberschrieben. Mit ihnen traegt er sich selbst.
         */
        const speicher = schreibbarerSpeicher();
        (globalThis as any).localStorage = speicher;
        save(zustand([['0.1.0.0', 'yes']]) as never, 61_000,
            { fingerprint: 'abc123', title: '3. Museum bei Nacht' });

        const stand = readSavedGame(KEY, speicher);
        expect(stand?.options).toEqual({ seed: 1_000_003, categoryCount: 3, valuesPerCategory: 4 });
        expect(stand?.fingerprint).toBe('abc123');
        expect(stand?.title).toBe('3. Museum bei Nacht');
        expect(stand?.puzzleIndex).toBe(0);
        expect(stand?.savedAt).not.toBeNull();
        expect(stand?.sure).toBe(1);
    });

    it('kommt ohne meta aus', () => {
        // Der Fingerabdruck entsteht asynchron und fehlt beim ersten Speichern.
        (globalThis as any).localStorage = schreibbarerSpeicher();
        expect(() => save(zustand([['0.1.0.0', 'yes']]) as never, 0)).not.toThrow();
    });

    it('hinterlaesst fuer ein leeres Gitter keinen Schluessel', () => {
        /*
         * Sonst hiesse "es gibt einen Schluessel" nicht mehr "hier wurde
         * angefangen": persist() laeuft auch bei visibilitychange, ein bloss
         * geoeffnetes und sofort verlassenes Raetsel hinterliesse also einen
         * Stand mit leeren Markierungen - und die Sammlung zaehlte es als
         * angefangen. Dieselbe Regel galt schon fuer den alten
         * Fortsetzungs-Platz, der sich bei marks.size === 0 selbst loeschte.
         */
        const speicher = schreibbarerSpeicher();
        (globalThis as any).localStorage = speicher;
        save(zustand([['0.1.0.0', 'yes']]) as never, 1000, { fingerprint: 'f', title: 't' });
        expect(listSavedGames(1, speicher)).toHaveLength(1);

        save(zustand([]) as never, 2000, { fingerprint: 'f', title: 't' });
        expect(listSavedGames(1, speicher)).toEqual([]);
    });

    it('behaelt ein geloestes Raetsel auch ohne Markierungen', () => {
        // Geloest ist kein leerer Stand, sondern ein Ergebnis.
        const speicher = schreibbarerSpeicher();
        (globalThis as any).localStorage = speicher;
        save(zustand([], { solved: true }) as never, 1000, { fingerprint: 'f', title: 't' });
        expect(listSavedGames(1, speicher)).toHaveLength(1);
    });
});
