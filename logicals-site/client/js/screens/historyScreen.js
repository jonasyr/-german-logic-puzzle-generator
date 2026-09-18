import { clear, el, make, setHint } from '../dom.js';
import { listPlayerResults } from '../players/playerApi.js';

function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.round(milliseconds / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Who won, and by how much.
 *
 * Only the two numbers that decide it - the time settles the duel, the failed
 * checks say how it was won. A duel whose other side has not finished yet says
 * so rather than showing a blank.
 */
function duelVerdict(result) {
    const row = make('p', { className: 'history-card__duel' });
    if (!result.opponentName) {
        row.classList.add('is-pending');
        row.textContent = 'Duell · das andere Ergebnis fehlt noch';
        return row;
    }

    const mine = result.elapsedMs;
    const theirs = result.opponentElapsedMs;
    const outcome = mine < theirs ? 'gewonnen' : mine > theirs ? 'verloren' : 'unentschieden';
    row.classList.add(`is-${outcome}`);

    const gap = Math.abs(mine - theirs);
    const margin = outcome === 'unentschieden' ? '' : ` · ${formatDuration(gap)} Unterschied`;
    row.append(
        make('strong', { text: `Duell ${outcome}` }),
        make('span', {
            text: ` gegen ${result.opponentName} — ${formatDuration(theirs)}`
                + ` · ${result.opponentFailedChecks} Fehlversuche${margin}`,
        }),
    );
    return row;
}

function resultCard(result) {
    const card = make('article', { className: 'history-card' });
    card.append(make('h3', { text: result.puzzleTitle }));
    card.append(make('p', {
        className: 'history-card__score',
        text: `${formatDuration(result.elapsedMs)} · ${result.failedChecks} Fehlversuche`,
    }));
    if (result.roomId) card.append(duelVerdict(result));
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
