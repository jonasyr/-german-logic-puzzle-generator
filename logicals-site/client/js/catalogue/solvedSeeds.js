/**
 * Welche Katalogeinträge dieser Spieler gelöst hat.
 *
 * Zusätzlich lokal abgelegt, weil die Sammlung sonst ohne Netz leer aussähe -
 * und eine leere Sammlung ist eine schlechtere Auskunft als eine veraltete.
 * Spielen selbst braucht ohnehin keine Verbindung: Rätsel werden im Browser
 * erzeugt.
 *
 * Eigene Abfrage statt der Ergebnisliste, weil die bei 100 Einträgen gedeckelt
 * ist und der Katalog 120 hat - und weil hier nur Zahlen gebraucht werden.
 */

const keyFor = playerId => `logicals.solvedSeeds.v1.${playerId}`;

/**
 * Der zuletzt bekannte Stand, ohne das Netz zu fragen.
 *
 * Je Spieler abgelegt: ein gemeinsamer Schlüssel würde auf einem geteilten
 * Gerät dem einen die Haken des anderen zeigen.
 */
export function cachedSolvedSeeds(playerId) {
    try {
        const raw = localStorage.getItem(keyFor(playerId));
        return new Set(raw ? JSON.parse(raw) : []);
    } catch {
        // Privater Modus oder beschädigter Speicher - dann eben ohne Haken.
        return new Set();
    }
}

/**
 * Holt den Stand und merkt ihn sich.
 *
 * Wirft nie. Jeder Fehlschlag fällt auf den Zwischenspeicher zurück, denn die
 * Sammlung darf ohne Netz Haken verlieren, aber nicht unbenutzbar werden.
 */
export async function loadSolvedSeeds(playerId) {
    let response;
    try {
        response = await fetch(`/api/players/${playerId}/solved-seeds`);
        if (!response.ok) throw new Error('nicht erreichbar');
    } catch {
        return cachedSolvedSeeds(playerId);
    }

    let seeds;
    try {
        seeds = (await response.json()).seeds ?? [];
    } catch {
        return cachedSolvedSeeds(playerId);
    }

    try {
        localStorage.setItem(keyFor(playerId), JSON.stringify(seeds));
    } catch {
        // Sich den Stand nicht merken zu können ist kein Grund, ihn nicht
        // anzuzeigen.
    }
    return new Set(seeds);
}
