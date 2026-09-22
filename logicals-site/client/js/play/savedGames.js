/**
 * Die gespeicherten Einzelspiele — gelesen aus dem Speicher, nicht aus einem Index.
 *
 * Ein mitgeschriebener Index wäre eine zweite Wahrheit neben den Ständen
 * selbst und driftete, sobald jemand den Speicher leert oder in einem zweiten
 * Tab spielt; die Sammlung zeigte dann einen Balken für ein leeres Rätsel.
 * Das Durchgehen kostet nichts, was sich messen ließe: es sind Schlüssel einer
 * Liste, keine Werte.
 *
 * Kennt den Speicher und keinen Bildschirm. `storage` ist ein Parameter, damit
 * Vitest das unter Node prüfen kann — dort gibt es kein localStorage.
 */

const PREFIX = 'logicals:play:';

/**
 * Zerlegt einen Schlüssel, oder gibt null zurück.
 *
 * Aufbau: logicals:play:<modus>:<raum>:<spieler>:<thema>:<seed>:<maße>:<hinweise>
 * Neun Teile. Alles andere ist kein Spielstand dieser App.
 *
 * @param {string | null} key
 * @returns {{ key: string, mode: string, room: string, playerId: number,
 *             themeId: string, seed: number,
 *             categoryCount: number, valuesPerCategory: number } | null}
 */
export function parseSavedKey(key) {
    if (!key?.startsWith(PREFIX)) return null;
    const parts = key.split(':');
    if (parts.length !== 9) return null;
    const [, , mode, room, player, themeId, seed, dimensions] = parts;
    const [categoryCount, valuesPerCategory] = dimensions.split('x').map(Number);
    const playerId = Number(player);
    if (!Number.isInteger(playerId) || !Number.isFinite(Number(seed))) return null;
    if (!Number.isInteger(categoryCount) || !Number.isInteger(valuesPerCategory)) return null;
    return {
        key, mode, room, playerId, themeId,
        seed: Number(seed), categoryCount, valuesPerCategory,
    };
}

/**
 * Alle Einzelspiel-Stände dieses Spielers — nur aus den Schlüsseln.
 *
 * Kein einziger JSON.parse: für „angefangen ja/nein" und die Zuordnung zu
 * einem Katalogeintrag reicht der Seed, und der steht im Schlüssel.
 *
 * @param {number} playerId
 * @param {Storage} [storage]
 */
export function listSavedGames(playerId, storage = localStorage) {
    const treffer = [];
    try {
        for (let index = 0; index < storage.length; index++) {
            const zerlegt = parseSavedKey(storage.key(index));
            if (!zerlegt) continue;
            if (zerlegt.mode !== 'solo' || zerlegt.room !== 'none') continue;
            if (zerlegt.playerId !== playerId) continue;
            const { key, themeId, seed, categoryCount, valuesPerCategory } = zerlegt;
            treffer.push({ key, themeId, seed, categoryCount, valuesPerCategory });
        }
    } catch {
        // Privater Modus oder gesperrter Speicher: dann eben ohne Auskunft.
        return [];
    }
    return treffer;
}
