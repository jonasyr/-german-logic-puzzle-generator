import { clear, el, make, setHint } from '../dom.js';
import { listPlayerHistory, listPlayerResults } from '../players/playerApi.js';
import { renderDuelsInto, renderStatsInto } from './statsScreen.js';
import { loadExperience } from '../stats/experience.js';
import { levelAt } from '../stats/level.js';
import { berlinDate } from '../play/dailyPuzzle.js';

/** Tagesdatum auf Deutsch - oder nichts, wenn der Wert keins hergibt. */
function formatDay(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('de-DE');
}

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
                + ` · ${result.opponentFailedChecks} `
                + `${result.opponentFailedChecks === 1 ? 'Fehlprüfung' : 'Fehlprüfungen'}${margin}`,
        }),
    );
    return row;
}

function resultCard(result) {
    const card = make('article', { className: 'history-card' });
    card.append(make('h3', { text: result.puzzleTitle }));
    card.append(make('p', {
        className: 'history-card__score',
        text: `${formatDuration(result.elapsedMs)} · ${result.failedChecks} `
            + `${result.failedChecks === 1 ? 'Fehlprüfung' : 'Fehlprüfungen'}`,
    }));
    if (result.roomId) card.append(duelVerdict(result));
    card.append(make('p', {
        className: 'history-card__meta',
        /*
         * Ein fehlendes oder unlesbares Datum darf nicht als "Invalid Date"
         * erscheinen - englischer Rohwert in einer deutschen Oberflaeche, und
         * fuer den Leser ein Defekt. Dann lieber die Zeile ohne Datum.
         */
        text: [
            result.difficulty,
            `Seed ${result.seed}`,
            formatDay(result.completedAt),
        ].filter(Boolean).join(' · '),
    }));
    return card;
}

export async function loadHistoryScreen(player) {
    el('history-player').textContent = player.displayName;
    const list = clear(el('history-list'));
    setHint('history-hint', 'Ergebnisse werden geladen …');
    try {
        // 100 ist die Obergrenze des Workers - darüber antwortet er mit 400
        // statt zu kappen - und beide Reiter teilen sich diese eine Abfrage.
        // Die Liste fragte vorher 50 ab und die Statistik daneben 100.
        const results = await listPlayerResults(player.id, 100);
        setHint('history-hint', results.length ? '' : 'Noch keine abgeschlossenen Rätsel.');
        for (const result of results) list.append(resultCard(result));
        /*
         * Die Statistik bekommt ihre eigene, ungedeckelte Liste.
         *
         * Die Karten oben zeigen weiter die letzten hundert - fuenfhundert
         * Karten zu zeichnen ist ein eigenes Problem. Die Kennzahlen daneben
         * rechnen ueber alles, genau wie die Erfahrung, damit auf einem
         * Bildschirm nicht zwei Massstaebe nebeneinander stehen.
         *
         * Faellt die Abfrage aus, wird mit den hundert gerechnet: eine
         * Statistik aus einem Ausschnitt ist eine bessere Auskunft als keine.
         */
        const alle = await listPlayerHistory(player.id);
        const vollstaendig = alle.length > 0;
        renderStatsInto(el('stats-body'), vollstaendig ? alle : results, berlinDate());
        renderDuelsInto(el('duels-body'), vollstaendig ? alle : results);
        renderProfile(await loadExperience(player.id));
        // Sagen, womit gerechnet wurde - nicht behaupten, was gewollt war.
        el('stats-scope').textContent = results.length
            ? (vollstaendig ? 'Über alle gelösten Rätsel.' : 'Über die letzten 100 Rätsel.')
            : '';
    } catch (error) { setHint('history-hint', error.message, true); }
}

/**
 * Die Reiter tauschen nur Sichtbarkeit.
 *
 * Geladen wurde beim Öffnen des Bildschirms einmal; ein Reiterwechsel ist eine
 * andere Sicht auf dieselben Daten, keine neue Frage an den Server.
 */
export function initHistoryTabs() {
    const tabs = [
        { tab: el('history-tab-list'), panel: el('history-panel-list') },
        { tab: el('history-tab-stats'), panel: el('history-panel-stats') },
        { tab: el('history-tab-duels'), panel: el('history-panel-duels') },
    ];
    for (const { tab } of tabs) {
        tab.addEventListener('click', () => {
            for (const entry of tabs) {
                const active = entry.tab === tab;
                entry.tab.setAttribute('aria-selected', String(active));
                entry.panel.hidden = !active;
            }
        });
    }
}

/** Umfang des Rings: 2·π·52, passend zum r=52 im Markup. */
const RING_LENGTH = 2 * Math.PI * 52;

/**
 * Zeichnet Stufe und Fortschritt in den Kopf.
 *
 * Ohne Stand bleibt der Ring weg und es steht nur der Name da - dieselbe Regel
 * wie im Gelöst-Dialog: lieber nichts als eine falsche Zahl. Bei 0 Punkten ist
 * der Ring leer und darunter steht, wie weit es bis Stufe 2 ist; das ist kein
 * Sonderfall, sondern der Zustand am ersten Tag.
 *
 * @param {{ xp: number } | null} experience
 */
function renderProfile(experience) {
    const ring = el('profile-ring');
    const gap = el('profile-gap');
    if (!experience) {
        ring.hidden = true;
        gap.textContent = '';
        return;
    }

    const stufe = levelAt(experience.xp);
    el('profile-level').textContent = String(stufe.level);

    // Voll heißt Versatz 0; der Rest des Umfangs bleibt unbemalt.
    const anteil = stufe.levelSpan > 0
        ? Math.max(0, Math.min(1, stufe.intoLevel / stufe.levelSpan))
        : 0;
    el('profile-fill').style.strokeDashoffset = String(RING_LENGTH * (1 - anteil));

    const fehlt = Math.max(0, stufe.next - experience.xp);
    gap.textContent = `Noch ${fehlt} bis Stufe ${stufe.level + 1}`;
    ring.hidden = false;
}
