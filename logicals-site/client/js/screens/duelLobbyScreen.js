import { clear, el, make, setHint } from '../dom.js';

/**
 * Die Form des Raetsels in einer Zeile: „5x5 - leicht".
 *
 * Aus der Raumangabe, nicht aus dem erzeugten Raetsel: die Lobby steht, bevor
 * das Gitter da ist, und der Beitretende hat es noch gar nicht geholt.
 */
function shapeOf(configuration) {
    if (!configuration) return '';
    const { categoryCount, valuesPerCategory, difficulty } = configuration;
    if (!categoryCount || !valuesPerCategory) return difficulty ?? '';
    return `${categoryCount}×${valuesPerCategory}${difficulty ? ` · ${difficulty}` : ''}`;
}

export function renderDuelLobby(room, currentPlayerId) {
    el('duel-room-code').textContent = room.code;
    el('duel-puzzle-title').textContent = room.puzzleTitle || 'Rätsel';
    el('duel-puzzle-shape').textContent = shapeOf(room.configuration);
    const members = clear(el('duel-members'));
    for (const member of room.members) {
        const row = make('div', { className: 'duel-member' });
        row.append(make('strong', {
            text: `${member.displayName}${member.playerId === currentPlayerId ? ' (du)' : ''}`,
        }));
        row.append(make('span', {
            className: member.ready ? 'status-good' : '',
            text: member.ready ? 'Bereit' : member.loaded ? 'Rätsel geladen' : 'Lädt …',
        }));
        members.append(row);
    }
    if (room.members.length < 2) {
        members.append(make('div', { className: 'duel-member duel-member--waiting', text: 'Warte auf Mitspieler …' }));
    }
    const me = room.members.find(member => member.playerId === currentPlayerId);
    el('duel-ready').disabled = !me?.loaded || me?.ready || room.state !== 'waiting';
    setHint('duel-lobby-hint', room.members.length < 2 ? 'Teile den Code oder Link mit deiner Mitspielerin.' : 'Beide Geräte müssen bereit sein.');
}

export function renderCountdown(seconds) {
    const node = el('duel-countdown');
    node.hidden = false;
    node.textContent = seconds > 0 ? String(seconds) : 'Los!';
}
