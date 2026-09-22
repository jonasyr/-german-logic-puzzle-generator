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

/**
 * Wie viele sichere Zuordnungen ein Rätsel dieser Maße überhaupt hat.
 *
 * Je Kategorienpaar genau `Werte` Stück, und es gibt C(Kategorien, 2) Paare.
 * Ein 3×4 hat 12, ein 5×5 deren 50 — ein gelöstes Rätsel steht damit genau
 * auf 100 %. Jede andere Bezugsgröße erreicht die Marke nie: automatische
 * Kreuze liegen in `auto` und zählen gar nicht als Markierung.
 */
function sureTotal(categoryCount, valuesPerCategory) {
    return valuesPerCategory * categoryCount * (categoryCount - 1) / 2;
}

/**
 * Ein Stand, gelesen. Null, wenn der Schlüssel keiner ist oder der Wert fehlt.
 *
 * @param {string} key
 * @param {Storage} [storage]
 * @returns {{ sure: number, total: number, marks: number, solved: boolean,
 *             elapsedMs: number, options: object|null, fingerprint: string|null,
 *             title: string|null, savedAt: string|null } | null}
 */
export function readSavedGame(key, storage = localStorage) {
    const zerlegt = parseSavedKey(key);
    if (!zerlegt) return null;
    let roh;
    try { roh = storage.getItem(key); } catch { return null; }
    if (!roh) return null;
    let wert;
    try { wert = JSON.parse(roh); } catch { return null; }
    const marks = Array.isArray(wert?.marks) ? wert.marks : [];
    return {
        sure: marks.filter(([, mark]) => mark === 'yes').length,
        total: sureTotal(zerlegt.categoryCount, zerlegt.valuesPerCategory),
        marks: marks.length,
        solved: Boolean(wert?.solved),
        elapsedMs: Number(wert?.elapsedMs) || 0,
        // Die vier Felder, mit denen ein Stand sich selbst trägt. Ältere
        // Stände haben sie nicht; das ist kein Fehler, nur eine Grenze.
        options: wert?.options ?? null,
        fingerprint: wert?.fingerprint ?? null,
        title: wert?.title ?? null,
        savedAt: wert?.savedAt ?? null,
    };
}
