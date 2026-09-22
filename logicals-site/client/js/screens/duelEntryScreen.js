/**
 * Der Duell-Bildschirm: starten oder beitreten.
 *
 * Vorher hieß er „Duell beitreten" und konnte auch nur das; erzeugt wurde ein
 * Duell im Konfigurator, unter einem zweiten Knopf neben „Spielen". Wer ein
 * Duell anfangen wollte, musste also erst ein eigenes Rätsel bauen — obwohl
 * die App längst eine Sammlung und ein Tagesrätsel hat, die beide besser
 * geeignet sind: gleiche Aufgabe für beide, ohne dass jemand Regler stellt.
 *
 * Die Quellenauswahl steht deshalb hier und nicht im Konfigurator. Der
 * Konfigurator ist nur noch eine der drei Quellen.
 */

import { el, setHint } from '../dom.js';
import { showScreen } from '../router.js';
import { berlinDate, dailyDifficulty, dailyOptions } from '../play/dailyPuzzle.js';

const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' });

function drawDailySource() {
    const date = berlinDate();
    const note = el('duel-source-daily-note');
    note.textContent = `${WEEKDAY.format(new Date(`${date}T12:00:00Z`))} · ${dailyDifficulty(date)}`;
    note.hidden = false;
}

/**
 * @param {{ onJoin: (code: string) => Promise<void>,
 *           onCreate: (options: object) => Promise<void>,
 *           onCustom: () => void,
 *           onFromCollection: () => void }} handlers
 */
export function initDuelEntry({ onJoin, onCreate, onCustom, onFromCollection }) {
    el('duel-join-button').addEventListener('click', () => showDuelEntry());

    /*
     * Die Sammlung waehlt man in der Sammlung.
     *
     * Vorher nahm dieser Knopf stillschweigend das naechste offene Raetsel -
     * eine Wahl, die er traf, ohne sie anzubieten. Jetzt oeffnet er dieselbe
     * Liste, die man ohnehin kennt, mit Haken, Balken und allem.
     */
    el('duel-source-collection').addEventListener('click', () => onFromCollection());
    el('duel-source-daily').addEventListener('click', () => onCreate(dailyOptions(berlinDate())));
    el('duel-source-custom').addEventListener('click', () => onCustom());

    el('duel-entry-form').addEventListener('submit', async event => {
        event.preventDefault();
        const code = el('duel-code').value.normalize('NFKC').trim().toUpperCase();
        const submit = event.submitter || el('duel-entry-submit');
        submit.disabled = true;
        setHint('duel-entry-hint', 'Rätsel wird abgeglichen …');
        try { await onJoin(code); }
        catch (error) { setHint('duel-entry-hint', error.message, true); }
        finally { submit.disabled = false; }
    });
}

export function showDuelEntry(code = '') {
    el('duel-code').value = code;
    setHint('duel-entry-hint', '');
    setHint('duel-create-hint', '');
    drawDailySource();
    showScreen('screen-duel-entry');
}
