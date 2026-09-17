const PREFIX = 'logicals.duel.v1:';
const ACTIVE_PREFIX = 'logicals.duel.active.v1:';

export function countdownSeconds(startsAt, now) {
    return Math.max(0, Math.ceil((startsAt - now) / 1000));
}

export function serverClockOffset(serverNow, sentAt, receivedAt) {
    return serverNow - ((sentAt + receivedAt) / 2);
}

export function saveDuelSession(session) {
    try {
        localStorage.setItem(`${PREFIX}${session.code}:${session.player.id}`, JSON.stringify(session));
        localStorage.setItem(`${ACTIVE_PREFIX}${session.player.id}`, session.code);
    }
    catch { /* A live in-memory duel remains playable. */ }
}

export function loadDuelSession(code, playerId) {
    try { return JSON.parse(localStorage.getItem(`${PREFIX}${code}:${playerId}`) || 'null'); }
    catch { return null; }
}

export function loadActiveDuelSession(playerId) {
    try {
        const code = localStorage.getItem(`${ACTIVE_PREFIX}${playerId}`);
        return code ? loadDuelSession(code, playerId) : null;
    } catch { return null; }
}

export function clearDuelSession(code, playerId) {
    try {
        localStorage.removeItem(`${PREFIX}${code}:${playerId}`);
        if (localStorage.getItem(`${ACTIVE_PREFIX}${playerId}`) === code) {
            localStorage.removeItem(`${ACTIVE_PREFIX}${playerId}`);
        }
    } catch { /* Nothing else to recover. */ }
}
