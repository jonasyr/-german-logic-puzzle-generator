async function readJson(response, fallback) {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || fallback);
    return data;
}

export async function listPlayers() {
    let response;
    try { response = await fetch('/api/players'); }
    catch { throw new Error('Spieler konnten nicht geladen werden.'); }
    return (await readJson(response, 'Spieler konnten nicht geladen werden.')).players;
}

export async function createPlayer(displayName) {
    let response;
    try {
        response = await fetch('/api/players', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ displayName }),
        });
    } catch {
        throw new Error('Zum Anlegen eines Spielers wird eine Verbindung benötigt.');
    }
    /*
     * Die Antwort auf ihre Form pruefen, nicht blind auspacken.
     *
     * Vorher stand hier nur `.player`. Kommt etwas anderes zurueck als
     * erwartet - eine veraenderte Schnittstelle, ein Portal im WLAN, das eine
     * Anmeldeseite unterschiebt -, war das Ergebnis `undefined`, und der
     * Aufrufer stolperte erst eine Zeile spaeter ueber `player.id`. Dieser
     * TypeError faellt in dasselbe catch wie die uebersetzten Fehler und
     * wurde dem Spieler im Klartext vorgesetzt: "Cannot read properties of
     * undefined (reading 'id')", im ersten Dialog der App.
     *
     * readJson uebersetzt bereits Netz- und JSON-Fehler; hier fehlte nur der
     * Fall "gueltiges JSON, falscher Inhalt".
     */
    const player = (await readJson(response, 'Spieler konnte nicht angelegt werden.')).player;
    if (!player || typeof player.id === 'undefined') {
        throw new Error('Spieler konnte nicht angelegt werden.');
    }
    return player;
}

/**
 * Alle Ergebnisse dieses Spielers, schmal - fuer die Statistik.
 *
 * Eigene Abfrage, weil listPlayerResults bei 100 gedeckelt ist und eine
 * Statistik ueber die letzten hundert eine andere Aussage ist als eine ueber
 * alle. Wirft nicht: ohne Netz gibt es eine leere Liste, und der Bildschirm
 * laesst die Statistik dann weg statt eine halbe zu zeigen.
 */
export async function listPlayerHistory(playerId) {
    try {
        const response = await fetch(`/api/players/${playerId}/history`);
        if (!response.ok) return [];
        return (await response.json()).results ?? [];
    } catch {
        return [];
    }
}

export async function listPlayerResults(playerId, limit = 50) {
    let response;
    try { response = await fetch(`/api/players/${playerId}/results?limit=${limit}`); }
    catch { throw new Error('Ergebnisse konnten nicht geladen werden.'); }
    return (await readJson(response, 'Ergebnisse konnten nicht geladen werden.')).results;
}
