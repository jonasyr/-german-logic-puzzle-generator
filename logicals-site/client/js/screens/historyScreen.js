import { clear, el, make, setHint } from '../dom.js';
import { listPlayerResults } from '../players/playerApi.js';

function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.round(milliseconds / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function resultCard(result) {
    const card = make('article', { className: 'history-card' });
    card.append(make('h3', { text: result.puzzleTitle }));
    card.append(make('p', {
        className: 'history-card__score',
        text: `${formatDuration(result.elapsedMs)} · ${result.failedChecks} Fehlversuche`,
    }));
    card.append(make('p', {
        className: 'history-card__meta',
        text: `${result.difficulty} · Seed ${result.seed} · ${new Date(result.completedAt).toLocaleDateString('de-DE')}`,
    }));
    return card;
}

export async function loadHistoryScreen(player) {
    el('history-player').textContent = `Ergebnisse von ${player.displayName}`;
    const list = clear(el('history-list'));
    setHint('history-hint', 'Ergebnisse werden geladen …');
    try {
        const results = await listPlayerResults(player.id);
        setHint('history-hint', results.length ? '' : 'Noch keine abgeschlossenen Rätsel.');
        for (const result of results) list.append(resultCard(result));
    } catch (error) { setHint('history-hint', error.message, true); }
}
