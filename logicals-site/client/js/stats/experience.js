/**
 * Der Erfahrungsstand dieses Spielers.
 *
 * Gerechnet wird serverseitig (worker/services/experience.ts), weil die
 * Ergebnisliste bei 100 gedeckelt ist und Erfahrung über alles zählen soll.
 * Hier wird nur gelesen und der letzte bekannte Stand gemerkt.
 *
 * Zusätzlich lokal abgelegt, aus demselben Grund wie bei den gelösten Seeds:
 * ohne Netz ist ein veralteter Stand eine bessere Auskunft als gar keiner -
 * aber nur zum Nachschlagen. Im Gelöst-Dialog wird ein veralteter Stand
 * bewusst NICHT gezeigt, weil dort der Zuwachs die Aussage ist und ein
 * falscher Zuwachs schlimmer wäre als keiner.
 */

const keyFor = playerId => `logicals.experience.v1.${playerId}`;

/**
 * Der zuletzt bekannte Stand, ohne das Netz zu fragen.
 *
 * Je Spieler abgelegt: ein gemeinsamer Schlüssel würde auf einem geteilten
 * Gerät dem einen die Punkte des anderen zeigen.
 *
 * @returns {{ xp: number, solved: number } | null}
 */
export function cachedExperience(playerId) {
    try {
        const raw = localStorage.getItem(keyFor(playerId));
        if (!raw) return null;
        const value = JSON.parse(raw);
        return Number.isFinite(value?.xp) ? { xp: value.xp, solved: value.solved ?? 0 } : null;
    } catch {
        // Privater Modus oder beschädigter Speicher - dann eben ohne Stand.
        return null;
    }
}

/**
 * Holt den Stand und merkt ihn.
 *
 * Wirft nicht: ohne Netz gibt es den gemerkten Stand, und wenn es auch den
 * nicht gibt, `null`. Die Aufrufer entscheiden dann, ob sie den Block
 * weglassen - eine falsche Zahl wäre schlechter als keine.
 *
 * @returns {Promise<{ xp: number, solved: number } | null>}
 */
export async function loadExperience(playerId) {
    try {
        const response = await fetch(`/api/players/${playerId}/experience`);
        if (!response.ok) return cachedExperience(playerId);
        const value = await response.json();
        if (!Number.isFinite(value?.xp)) return cachedExperience(playerId);

        const stand = { xp: value.xp, solved: value.solved ?? 0 };
        try {
            localStorage.setItem(keyFor(playerId), JSON.stringify(stand));
        } catch {
            // Nicht schreiben zu können ist kein Grund, nichts zu liefern.
        }
        return stand;
    } catch {
        return cachedExperience(playerId);
    }
}
