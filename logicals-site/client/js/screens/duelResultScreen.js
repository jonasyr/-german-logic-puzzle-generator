import { clear, el, make, setHint } from '../dom.js';
import { entryAfter } from '../catalogue/catalogue.js';
import { playCatalogueEntry } from './collectionScreen.js';
import { formatTime } from '../play/playTimer.js';
import { duelResultState, forfeitScore } from '../duel/opponentState.js';

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
    /*
     * Weiter statt hinaus - dieselbe Regel wie im Gelöst-Dialog.
     *
     * Woher das Rätsel kam, muss der Raum sich nicht merken: der Seed steht in
     * seinen Angaben, und der Katalog weiß den Rest. Am Kapitelende bewusst
     * nichts - ein Kapitel zu beenden ist ein Moment, und stillschweigend im
     * nächsten zu landen nähme ihn weg.
     */
    const folgend = entryAfter(room.effectivePuzzleSeed);
    const next = el('duel-result-next');
    next.hidden = !folgend;
    next.onclick = folgend
        ? () => playCatalogueEntry(folgend.chapter, folgend.entry)
        : null;

    const { complete, hint, forfeitedBy } = duelResultState(room, currentPlayerId);
    /*
     * Der Aufgebende bekommt seine eigene Kachel — gleiche Form, nur ohne
     * Ergebnis. Liesse man sie weg, staende da ein Duell mit einem einzigen
     * Teilnehmer, und der Sieg haette kein Gegenueber.
     */
    if (forfeitedBy) {
        const card = make('article', { className: 'duel-result-card is-forfeit' });
        card.append(
            make('div', { className: 'duel-result-card__name', text: forfeitedBy.displayName }),
            make('strong', { className: 'duel-result-card__outcome', text: 'Aufgegeben' }),
            make('p', {
                className: 'duel-result-card__score',
                text: forfeitScore(forfeitedBy.filled),
            }),
        );
        list.append(card);
    }
    setHint('duel-result-hint', hint);
    el('duel-result-waiting').hidden = complete;
    return complete;
}

/**
 * Trägt den Erfahrungsstand nach, sobald er vorliegt.
 *
 * Gleiche Form und gleiche Regel wie showSolvedExperience im Einzelspiel:
 * ohne Stand bleibt der Block weg, weil eine falsche Zahl schlechter wäre als
 * keine. Der Zuwachs ist die Differenz zum gemerkten Stand - so muss die
 * Formel nicht auch im Client stehen, sondern bleibt allein im Worker.
 *
 * Rechts steht, was fehlt, nicht wo man ist: in welcher Stufe man sich
 * befindet, zeigt der Balken darunter ohnehin.
 *
 * @param {{ gain: number|null, xp: number, level: number,
 *           intoLevel: number, levelSpan: number } | null} standing
 */
export function renderDuelExperience(standing) {
    const block = el('duel-xp');
    if (!standing) { block.hidden = true; return; }

    el('duel-xp-gain').textContent = standing.gain === null || standing.gain <= 0
        ? `${standing.xp} Erfahrung`
        : `+${standing.gain}`;
    const fehlt = Math.max(0, standing.levelSpan - standing.intoLevel);
    el('duel-xp-level').textContent = `Noch ${fehlt} bis Stufe ${standing.level + 1}`;

    const anteil = standing.levelSpan > 0
        ? Math.max(0, Math.min(1, standing.intoLevel / standing.levelSpan))
        : 0;
    el('duel-xp-fill').style.width = `${Math.round(anteil * 100)}%`;
    block.hidden = false;
}
