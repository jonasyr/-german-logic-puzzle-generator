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
    /*
     * Ziffern, nichts sonst.
     *
     * `Number()` nimmt auch '1e3', '0x10' und den leeren String; ein Filter,
     * der mehr Strenge verspricht als er leistet, ist schlimmer als keiner.
     *
     * Der Spielerteil kann laut `storageKeyFor` auch 'anonymous' lauten, wenn
     * ohne ausgewaehlten Spieler gespielt wird. Solche Staende gehoeren
     * niemandem und bleiben hier aussen vor — erreichbar ist dieser Fall
     * heute nicht, weil jeder Einzelspiel-Weg an einem Knopf haengt, der
     * ohne Spieler deaktiviert ist.
     */
    if (!/^\d+$/.test(player) || !/^\d+$/.test(seed)) return null;
    const masze = dimensions.match(/^(\d+)x(\d+)$/);
    if (!masze) return null;
    const playerId = Number(player);
    const categoryCount = Number(masze[1]);
    const valuesPerCategory = Number(masze[2]);
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
 * auf 100 %, denn `evaluate` verlangt für „gelöst" jede dieser Zuordnungen
 * als `yes`.
 *
 * Gezählt wird deshalb `yes`, nicht die Zahl der Markierungen: abgeleitete
 * Kreuze stehen sehr wohl in `marks` (siehe `setMarkWith`, das sie in
 * `marks` UND `auto` einträgt), ein Anteil an allen Markierungen liefe also
 * je nach Hilfseinstellung anders — und erreichte die 100 % nie.
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
 *             elapsedMs: number, options: object|null, puzzleIndex: number,
 *             fingerprint: string|null, title: string|null,
 *             savedAt: string|null } | null}
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
        /*
         * Jeder Eintrag einzeln geprüft, nicht zerlegt.
         *
         * `marks.filter(([, mark]) => …)` setzt voraus, dass jedes Element
         * iterierbar ist; ein Wert wie `{"marks":[null]}` warf damit einen
         * TypeError — und weil weder das Suchen des jüngsten Standes noch das
         * Aufräumen ein `try` haben, riss ein einziger verfälschter Eintrag
         * das Öffnen eines Rätsels mit.
         */
        sure: marks.filter(eintrag => Array.isArray(eintrag) && eintrag[1] === 'yes').length,
        total: sureTotal(zerlegt.categoryCount, zerlegt.valuesPerCategory),
        marks: marks.length,
        solved: Boolean(wert?.solved),
        elapsedMs: Number(wert?.elapsedMs) || 0,
        // Die vier Felder, mit denen ein Stand sich selbst trägt. Ältere
        // Stände haben sie nicht; das ist kein Fehler, nur eine Grenze.
        options: wert?.options ?? null,
        // Im Einzelspiel heute immer 0 — aber eine stille Annahme ist keine.
        puzzleIndex: Number.isInteger(wert?.puzzleIndex) ? wert.puzzleIndex : 0,
        fingerprint: wert?.fingerprint ?? null,
        title: wert?.title ?? null,
        savedAt: wert?.savedAt ?? null,
    };
}

/** Sortierschlüssel: ohne Zeitmarke gilt ein Stand als der älteste. */
function zeit(savedAt) {
    const wert = savedAt ? Date.parse(savedAt) : Number.NaN;
    return Number.isFinite(wert) ? wert : 0;
}

/**
 * Der jüngste Stand, zu dem zurückzukommen sich lohnt.
 *
 * Gelöst und leer fallen weg — beides ist nichts, wozu man zurückkommt. Und
 * ohne `options` und `fingerprint` lässt sich das Rätsel nicht identisch neu
 * erzeugen; ein Knopf, der ins Nichts führt, ist schlimmer als keiner.
 *
 * @param {number} playerId
 * @param {Storage} [storage]
 * @returns {{ key: string, seed: number, options: object, puzzleIndex: number,
 *             fingerprint: string, title: string|null, elapsedMs: number,
 *             marks: number, sure: number, total: number } | null}
 */
export function newestSavedGame(playerId, storage = localStorage) {
    let bester = null;
    for (const eintrag of listSavedGames(playerId, storage)) {
        const stand = readSavedGame(eintrag.key, storage);
        if (!stand || stand.solved || stand.marks === 0) continue;
        if (!stand.options || !stand.fingerprint) continue;
        if (bester && zeit(stand.savedAt) <= zeit(bester.savedAt)) continue;
        bester = {
            key: eintrag.key, seed: eintrag.seed, savedAt: stand.savedAt,
            options: stand.options, puzzleIndex: stand.puzzleIndex,
            fingerprint: stand.fingerprint, title: stand.title,
            elapsedMs: stand.elapsedMs, marks: stand.marks,
            // Damit der Startbildschirm dasselbe Mass nennen kann wie die
            // Sammlung: die Zahl der Markierungen springt beim Bestaetigen
            // um neun, weil abgeleitete Kreuze mitzaehlen.
            sure: stand.sure, total: stand.total,
        };
    }
    if (!bester) return null;
    const { savedAt, ...rest } = bester;
    return rest;
}

/**
 * Schneidet auf `limit` Stände zurück, ältester zuerst.
 *
 * Die Sammlung braucht höchstens 120 je Spieler, gedeckelt werden also nur
 * gewürfelte Einmal-Rätsel. Läuft beim Öffnen eines Spiels, nicht bei jedem
 * Speichern: beim Markieren ist Rechenzeit teuer, beim Öffnen nicht.
 *
 * @returns {number} wie viele entfernt wurden
 */
export function pruneSavedGames(playerId, limit = 200, storage = localStorage) {
    /*
     * Erst zählen, dann lesen.
     *
     * Das Zählen geht über die Schlüssel und kostet nichts; die Werte werden
     * nur angefasst, wenn wirklich etwas wegfällt. Sonst parste dieser Weg
     * bei JEDEM Öffnen eines Rätsels alle 200 Stände — und widerlegte damit
     * genau das Argument, mit dem der mitgeschriebene Index verworfen wurde.
     */
    const schluessel = listSavedGames(playerId, storage);
    if (schluessel.length <= limit) return 0;

    const alle = schluessel
        .map(eintrag => ({ key: eintrag.key, at: zeit(readSavedGame(eintrag.key, storage)?.savedAt) }))
        .sort((a, b) => a.at - b.at);
    const zuviel = alle.length - limit;
    if (zuviel <= 0) return 0;
    let entfernt = 0;
    for (const eintrag of alle.slice(0, zuviel)) {
        try { storage.removeItem(eintrag.key); entfernt++; } catch { /* dann eben nicht */ }
    }
    return entfernt;
}
