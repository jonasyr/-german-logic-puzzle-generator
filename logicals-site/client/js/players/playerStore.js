const STORAGE_KEY = 'logicals.players.v1';

let state = { players: [], selectedPlayerId: null };

function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { /* Storage pressure must not prevent play. */ }
}

export function loadPlayerState() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (stored && Array.isArray(stored.players)) {
            state = {
                players: stored.players.filter(player => Number.isSafeInteger(player?.id)),
                selectedPlayerId: Number.isSafeInteger(stored.selectedPlayerId) ? stored.selectedPlayerId : null,
            };
        }
    } catch { state = { players: [], selectedPlayerId: null }; }
    return snapshot();
}

export function cachePlayers(players) {
    state.players = [...players];
    if (!state.players.some(player => player.id === state.selectedPlayerId)) state.selectedPlayerId = null;
    persist();
    return snapshot();
}

export function selectPlayer(playerId) {
    state.selectedPlayerId = state.players.some(player => player.id === playerId) ? playerId : null;
    persist();
    return getSelectedPlayer();
}

export function getSelectedPlayer() {
    return state.players.find(player => player.id === state.selectedPlayerId) ?? null;
}

export function snapshot() {
    return { players: [...state.players], selectedPlayerId: state.selectedPlayerId };
}
