async function request(path, options = {}) {
    let response;
    try { response = await fetch(path, options); }
    catch { throw new Error('Keine Verbindung zum Duellraum.'); }
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
        const error = new Error(data.error || 'Der Duellraum konnte nicht verarbeitet werden.');
        error.code = data.code;
        throw error;
    }
    return data;
}

function jsonPost(body, signal) {
    return {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        ...(signal ? { signal } : {}),
    };
}

export function createDuelRoom(payload) {
    return request('/api/rooms', jsonPost(payload));
}

export function joinDuelRoom(code, payload) {
    return request(`/api/rooms/${code}/join`, jsonPost(payload));
}

export function markDuelLoaded(code, payload) {
    return request(`/api/rooms/${code}/loaded`, jsonPost(payload));
}

export function reportDuelProgress(code, payload) {
    return request(`/api/rooms/${code}/progress`, jsonPost(payload));
}

export function markDuelReady(code, payload) {
    return request(`/api/rooms/${code}/ready`, jsonPost(payload));
}

export async function getDuelRoom(code, signal) {
    const sentAt = Date.now();
    const data = await request(`/api/rooms/${code}`, { signal });
    return { ...data, sentAt, receivedAt: Date.now() };
}

/**
 * Aufgeben melden.
 *
 * Ohne diesen Ruf bliebe der Gegner nach seinem Sieg in „Warte auf …"
 * stehen, bis der Raum nach 24 Stunden verfällt — er hätte gewonnen und
 * erführe es nie. Der Raum wird abgeschlossen; da `markComplete` sonst
 * ausschließlich bei zwei Ergebnissen läuft, heißt „abgeschlossen mit
 * einem Ergebnis" eindeutig: der andere ist ausgestiegen.
 *
 * Der Aufruf darf scheitern, ohne dass der Aufgebende etwas merkt — sein
 * Weg zurück ins Einzelspiel hängt nicht am Netz.
 */
export function forfeitDuel(code, payload) {
    return request(`/api/rooms/${code}/forfeit`, jsonPost(payload));
}
