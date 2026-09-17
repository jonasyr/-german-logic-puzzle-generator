import { clear, el, make, setHint } from '../dom.js';

export function renderDuelLobby(room, currentPlayerId) {
    el('duel-room-code').textContent = room.code;
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
