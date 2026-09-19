/**
 * Die Sammlung: zehn Kapitel, je zwölf Einträge.
 *
 * Macht aus einem Generator, der unendlich viel kann, etwas Endliches - und
 * damit etwas, das man zu Ende bringen kann. Unendlich heißt sonst: nichts ist
 * besonders, nichts ist je fertig, es gibt nichts zu sammeln.
 *
 * Nichts ist gesperrt. Der Weiter-Knopf schlägt den nächsten offenen Eintrag
 * vor, springen ist erlaubt - eine Sammlung, die zwingt, wäre das Gegenteil
 * dessen, wofür „Uhr ausblenden" und „Duell ausblenden" gebaut wurden.
 */

import { clear, el, make, setHint } from '../dom.js';
import { onEnter, showScreen } from '../router.js';
import { clearBusy, setBusy } from '../ui/busy.js';
import { fetchBooklet } from '../api.js';
import {
    chapterFor, chapters, newClueTypeAt, nextOpen, optionsFor, progressOf, totalProgress,
} from '../catalogue/catalogue.js';
import { cachedSolvedSeeds, loadSolvedSeeds } from '../catalogue/solvedSeeds.js';

let solved = new Set();
/** Wurde für diesen Spieler schon einmal ein Stand ermittelt? */
let known = false;
let openPlayFn = null;
let activePlayer = null;
/** Welches Kapitel offen ist, damit das Betreten es neu zeichnen kann. */
let openThemeId = null;

/**
 * Die Zeile unter dem Knopf auf dem Startbildschirm.
 *
 * Bleibt verborgen, solange nichts bekannt ist. „0 von 120" wäre keine
 * Zurückhaltung, sondern eine Falschaussage: der Spieler hat vielleicht
 * vierzig gelöst, nur weiß dieses Gerät es noch nicht.
 */
export function renderCollectionNote(player) {
    const note = el('collection-detail');
    if (!player) { note.hidden = true; return; }
    solved = cachedSolvedSeeds(player.id);
    known = solved.size > 0;
    if (!known) { note.hidden = true; return; }
    const total = totalProgress(solved);
    note.hidden = false;
    note.textContent = `${total.solved} von ${total.total} gelöst`;
}

function chapterRow(chapter) {
    const part = progressOf(chapter, solved);
    const done = part.solved === part.total;
    const row = make('button', {
        className: `list-row chapter-row${done ? ' is-solved' : ''}`,
        attrs: { type: 'button' },
    });
    row.append(make('h3', { text: chapter.title }));
    row.append(make('p', {
        className: 'list-row__score',
        text: done ? `${part.solved}/${part.total} ✓` : `${part.solved}/${part.total}`,
    }));

    /*
     * Ein feiner Strich, keine Fortschrittsanzeige.
     *
     * Zehn Zeilen "0/12" untereinander sind eine Wand aus Nullen - und genau
     * dort entscheidet sich, ob jemand anfaengt. Drei Pixel unten an der Zeile
     * sagen dasselbe als Form statt als Ziffer, ohne der Liste Gewicht zu
     * geben. Fuer Screenreader traegt die Zahl daneben die Auskunft bereits,
     * also bleibt der Strich dekorativ.
     */
    const meter = make('span', { className: 'chapter-meter', attrs: { 'aria-hidden': 'true' } });
    const fill = make('span', { className: 'chapter-meter__fill' });
    fill.style.width = `${Math.round((part.solved / part.total) * 100)}%`;
    meter.append(fill);
    row.append(meter);

    row.addEventListener('click', () => openChapter(chapter.themeId));
    return row;
}

function entryRow(chapter, entry, index, next) {
    const isSolved = solved.has(entry.seed);
    /*
     * Wo es weitergeht, markiert ein Akzentstreifen am linken Rand - kein
     * Text.
     *
     * Bei verstreut geloesten Eintraegen liegt die Luecke irgendwo in der
     * Mitte, und man soll sie sehen statt suchen. Eine Zeile "Hier geht es
     * weiter" waere lauter als noetig und machte die Zeile hoeher als ihre
     * Nachbarn.
     */
    const isNext = !isSolved && next !== null && entry.seed === next.seed;
    const row = make('button', {
        className: `list-row entry-row${isSolved ? ' is-solved' : ''}${isNext ? ' is-next' : ''}`,
        attrs: { type: 'button' },
    });
    if (isNext) row.setAttribute('aria-current', 'step');
    // Alle zwölf Einträge tragen denselben Titel, also trägt ihn die Zeile
    // nicht: Nummer, Gitter und Stufe sind das, was sie unterscheidet.
    row.append(make('h3', {
        text: `${entry.number}. ${entry.categoryCount}×${entry.valuesPerCategory} · ${entry.difficulty}`,
    }));
    const fresh = newClueTypeAt(chapter, index);
    if (fresh) row.append(make('p', { className: 'list-row__meta', text: `Neu: „${fresh}“` }));
    if (isSolved) row.append(make('p', { className: 'list-row__score', text: '✓ gelöst' }));
    row.addEventListener('click', () => play(chapter, entry));
    return row;
}

/**
 * Erzeugt einen Eintrag und öffnet ihn.
 *
 * Mit Overlay: 5×5 schwer braucht gemessen 2,4 Sekunden. Ohne Anzeige tippt
 * man und es geschieht scheinbar nichts - lange genug, um ein zweites Mal zu
 * tippen.
 */
async function play(chapter, entry) {
    setHint('chapter-hint', '');
    setHint('collection-hint', '');
    setBusy('Rätsel wird erzeugt …');
    try {
        const options = optionsFor(chapter, entry);
        const generated = await fetchBooklet(options);
        const puzzle = generated.booklet.puzzles[0];
        if (!puzzle) throw new Error('Dieses Rätsel konnte nicht erzeugt werden.');
        openPlayFn(puzzle, {
            mode: 'solo', player: activePlayer, options, puzzleIndex: 0,
        });
    } catch (error) {
        // Ein Eintrag, der nicht aufgeht, darf das Kapitel nicht blockieren.
        const target = openThemeId ? 'chapter-hint' : 'collection-hint';
        setHint(target, error.message, true);
    } finally {
        clearBusy();
    }
}

function openChapter(themeId) {
    openThemeId = themeId;
    drawChapter();
    showScreen('screen-chapter');
}

function drawChapter() {
    const chapter = chapterFor(openThemeId);
    if (!chapter) return;
    el('chapter-title').textContent = chapter.title;
    const part = progressOf(chapter, solved);
    el('chapter-progress').textContent = `${part.solved} von ${part.total} gelöst`;
    const list = clear(el('entry-list'));
    const next = nextOpen(chapter, solved);
    chapter.entries.forEach((entry, index) => list.append(entryRow(chapter, entry, index, next)));
}

function drawCollection() {
    const total = totalProgress(solved);
    el('collection-total').textContent = known
        ? `${total.solved} von ${total.total} gelöst`
        : 'Wird geladen …';

    /*
     * Die erste Handlung ist Weiterspielen - kurz beschriftet, Ziel darunter.
     *
     * "Weiter: Finale beim Street-Food-Festival, 1" brach auf zwei Zeilen und
     * liess ein einsames ", 1" am Ende baumeln. Dieselbe Trennung wie beim
     * Tagesraetsel: Knopf sagt die Handlung, die Zeile darunter das Ziel.
     */
    const chapter = chapters().find(candidate => nextOpen(candidate, solved));
    const button = el('collection-continue');
    const next = el('collection-next');
    const done = el('collection-done');

    if (chapter) {
        const entry = nextOpen(chapter, solved);
        button.hidden = false;
        button.onclick = () => play(chapter, entry);
        next.hidden = false;
        next.textContent = `${chapter.title} · ${entry.number} von ${chapter.entries.length}`;
        done.hidden = true;
    } else {
        /*
         * Fertig heisst fertig, nicht "ausgegrauter Knopf".
         *
         * Ein deaktivierter Knopf nach 120 geloesten Raetseln sieht aus wie
         * ein Fehler - und das ist der eine Moment, in dem die Sammlung etwas
         * zu sagen haette.
         */
        button.hidden = true;
        button.onclick = null;
        next.hidden = true;
        done.hidden = false;
        done.textContent = 'Alle 120 gelöst. Die Sammlung ist vollständig.';
    }

    const list = clear(el('chapter-list'));
    for (const chapter of chapters()) list.append(chapterRow(chapter));
}

export async function openCollection(player) {
    activePlayer = player;
    openThemeId = null;
    showScreen('screen-collection');
    // Erst aus dem Zwischenspeicher, damit sofort etwas dasteht.
    solved = cachedSolvedSeeds(player.id);
    known = solved.size > 0;
    drawCollection();
    solved = await loadSolvedSeeds(player.id);
    known = true;
    drawCollection();
}

export function initCollection({ onOpenPlay }) {
    openPlayFn = onOpenPlay;

    /*
     * Beim Betreten neu zeichnen.
     *
     * Der Router poppt den Verlauf, also kommt man aus einem gelösten Rätsel
     * per Zurück genau hierher - und ohne das behauptete der Bildschirm, der
     * eben gelöste Eintrag sei noch offen.
     */
    onEnter(async id => {
        if (id !== 'screen-collection' && id !== 'screen-chapter') return;
        if (!activePlayer) return;
        solved = await loadSolvedSeeds(activePlayer.id);
        known = true;
        if (id === 'screen-collection') drawCollection(); else drawChapter();
    });
}
