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
