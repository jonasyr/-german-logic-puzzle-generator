import { describe, expect, it } from 'vitest';
import { listSavedGames } from '../client/js/play/savedGames.js';

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
