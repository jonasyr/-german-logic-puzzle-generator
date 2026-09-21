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
import { chapters, nextOpen, optionsFor } from '../catalogue/catalogue.js';
import { cachedSolvedSeeds, loadSolvedSeeds } from '../catalogue/solvedSeeds.js';
import { berlinDate, dailyDifficulty, dailyOptions } from '../play/dailyPuzzle.js';

/** Wer gerade spielt - für den Stand der Sammlung. */
let activePlayer = null;
/** Was „Aus der Sammlung" gerade meint, oder null. */
let collectionTarget = null;

const WEEKDAY = new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' });

/**
 * Der nächste offene Eintrag über alle Kapitel - oder null.
 *
 * Dieselbe Regel wie der Weiter-Knopf der Sammlung: das erste Kapitel, das
 * noch etwas Offenes hat. Springen bleibt erlaubt, nur eben nicht von hier.
 */
function nextCatalogueEntry(solved) {
    for (const chapter of chapters()) {
        const entry = nextOpen(chapter, solved);
        if (entry) return { chapter, entry };
    }
    return null;
}

function drawCollectionSource(treffer) {
    collectionTarget = treffer;
    const button = el('duel-source-collection');
    const note = el('duel-source-collection-note');
    if (!treffer) {
        /*
         * Alles gelöst: der Knopf verspricht dann nichts mehr. Ausgegraut
         * statt verborgen, damit die Auswahl nicht die Höhe wechselt,
         * während der Stand nachgeladen wird.
         */
        button.disabled = true;
        note.textContent = 'Alle Sammlungsrätsel sind gelöst.';
        note.hidden = false;
        return;
    }
    button.disabled = false;
    note.textContent = `${treffer.entry.number}. ${treffer.chapter.title}`;
    note.hidden = false;
}

function drawDailySource() {
    const date = berlinDate();
    const note = el('duel-source-daily-note');
    note.textContent = `${WEEKDAY.format(new Date(`${date}T12:00:00Z`))} · ${dailyDifficulty(date)}`;
    note.hidden = false;
}

/**
 * @param {{ onJoin: (code: string) => Promise<void>,
 *           onCreate: (options: object) => Promise<void>,
 *           onCustom: () => void }} handlers
 */
export function initDuelEntry({ onJoin, onCreate, onCustom }) {
    el('duel-join-button').addEventListener('click', () => showDuelEntry());

    el('duel-source-collection').addEventListener('click', () => {
        if (!collectionTarget) return;
        onCreate(optionsFor(collectionTarget.chapter, collectionTarget.entry));
    });
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

/** Wessen Sammlungsstand die Quellenauswahl meint. */
export function setDuelPlayer(player) {
    activePlayer = player;
}

export function showDuelEntry(code = '') {
    el('duel-code').value = code;
    setHint('duel-entry-hint', '');
    setHint('duel-create-hint', '');
    drawDailySource();

    /*
     * Erst der gemerkte Stand, dann der geholte. Ohne den gemerkten stünde
     * der Knopf beim Öffnen ohne Ziel da und bekäme es eine Netzrunde
     * später - genau das Flackern, das die Sammlung schon vermeidet.
     */
    if (activePlayer) {
        drawCollectionSource(nextCatalogueEntry(cachedSolvedSeeds(activePlayer.id)));
        const wer = activePlayer.id;
        loadSolvedSeeds(wer).then(solved => {
            // Der Spieler kann inzwischen gewechselt haben.
            if (activePlayer?.id === wer) drawCollectionSource(nextCatalogueEntry(solved));
        }).catch(() => { /* ohne Stand bleibt der gemerkte stehen */ });
    } else {
        drawCollectionSource(null);
    }

    showScreen('screen-duel-entry');
}
