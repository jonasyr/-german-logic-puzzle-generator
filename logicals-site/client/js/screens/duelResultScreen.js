import { clear, el, make, setHint } from '../dom.js';
import { formatTime } from '../play/playTimer.js';

const OUTCOME = { won: 'Gewonnen', lost: 'Verloren', tie: 'Unentschieden', waiting: 'Fertig' };

export function renderDuelResults(room, currentPlayerId) {
    el('duel-result-title').textContent = room.puzzleTitle;
    const list = clear(el('duel-result-list'));
    for (const result of room.results || []) {
        const card = make('article', {
            className: `duel-result-card${result.playerId === currentPlayerId ? ' is-current' : ''}`,
        });
        card.append(
            make('div', { className: 'duel-result-card__name', text: result.displayName }),
            make('strong', { className: 'duel-result-card__outcome', text: OUTCOME[result.outcome] || 'Fertig' }),
            make('p', {
                className: 'duel-result-card__score',
                text: `${formatTime(result.elapsedMs)} · ${result.failedChecks} ${result.failedChecks === 1 ? 'Fehlprüfung' : 'Fehlprüfungen'}`,
            }),
        );
        list.append(card);
    }
    const complete = (room.results || []).length === 2;
    const mineStored = (room.results || []).some(result => result.playerId === currentPlayerId);
    setHint('duel-result-hint', complete
        ? 'Beide Ergebnisse sind gespeichert.'
        : mineStored
            ? 'Dein Ergebnis ist gespeichert. Warte auf das andere Gerät …'
            : 'Dein Ergebnis wird übertragen. Die Auswertung erscheint danach automatisch …');
    el('duel-result-waiting').hidden = complete;
    return complete;
}
