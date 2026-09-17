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
    return (await readJson(response, 'Spieler konnte nicht angelegt werden.')).player;
}

export async function listPlayerResults(playerId, limit = 50) {
    let response;
    try { response = await fetch(`/api/players/${playerId}/results?limit=${limit}`); }
    catch { throw new Error('Ergebnisse konnten nicht geladen werden.'); }
    return (await readJson(response, 'Ergebnisse konnten nicht geladen werden.')).results;
}
