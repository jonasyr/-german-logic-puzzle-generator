import { clear, el, make, setHint } from '../dom.js';
import { showScreen } from '../router.js';
import { initHistoryTabs, loadHistoryScreen } from '../screens/historyScreen.js';
import { createPlayer, listPlayers } from './playerApi.js';
import { cachePlayers, getSelectedPlayer, loadPlayerState, selectPlayer, snapshot } from './playerStore.js';

function updateStart() {
    const player = getSelectedPlayer();
    el('player-button').textContent = player ? `Spielen als ${player.displayName}` : 'Spieler auswählen';
    el('start-button').disabled = !player;
    el('duel-join-button').disabled = !player;
    el('history-button').disabled = !player;
}

function choose(playerId) {
    selectPlayer(playerId);
    updateStart();
    el('player-dialog').close();
}

function renderPlayers() {
    const { players, selectedPlayerId } = snapshot();
    const list = clear(el('player-list'));
    if (!players.length) {
        list.append(make('p', { className: 'player-list__empty', text: 'Noch kein Spieler angelegt.' }));
        return;
    }
    for (const player of players) {
        const button = make('button', {
            className: 'player-choice', text: player.displayName,
            attrs: { type: 'button', 'aria-pressed': String(player.id === selectedPlayerId) },
        });
        button.addEventListener('click', () => choose(player.id));
        list.append(button);
    }
}

function openDialog() {
    renderPlayers();
    setHint('player-hint', '');
    el('player-dialog').showModal();
    if (!snapshot().players.length) requestAnimationFrame(() => el('player-name').focus());
}

export async function initPlayerController() {
    loadPlayerState();
    updateStart();
    initHistoryTabs();
    el('player-button').addEventListener('click', openDialog);
    el('player-close').addEventListener('click', () => el('player-dialog').close());
    el('history-button').addEventListener('click', () => {
        const player = getSelectedPlayer();
        if (!player) return;
        showScreen('screen-history');
        loadHistoryScreen(player);
    });
    el('player-form').addEventListener('submit', async event => {
        event.preventDefault();
        const input = el('player-name');
        const submit = event.submitter;
        submit.disabled = true;
        setHint('player-hint', '');
        try {
            const player = await createPlayer(input.value);
            const players = snapshot().players.filter(existing => existing.id !== player.id);
            cachePlayers([...players, player].sort((a, b) => a.displayName.localeCompare(b.displayName, 'de')));
            input.value = '';
            choose(player.id);
        } catch (error) { setHint('player-hint', error.message, true); }
        finally { submit.disabled = false; }
    });

    try { cachePlayers(await listPlayers()); }
    catch (error) { if (!snapshot().players.length) setHint('player-hint', error.message, true); }
    updateStart();
    if (!getSelectedPlayer()) openDialog();
}
