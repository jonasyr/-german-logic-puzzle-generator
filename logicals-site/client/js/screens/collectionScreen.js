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
    row.addEventListener('click', () => openChapter(chapter.themeId));
    return row;
}

function entryRow(chapter, entry, index) {
    const isSolved = solved.has(entry.seed);
    const row = make('button', {
        className: `list-row entry-row${isSolved ? ' is-solved' : ''}`,
        attrs: { type: 'button' },
    });
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
    chapter.entries.forEach((entry, index) => list.append(entryRow(chapter, entry, index)));
}

function drawCollection() {
    const total = totalProgress(solved);
    el('collection-total').textContent = known
        ? `${total.solved} von ${total.total} gelöst`
        : 'Wird geladen …';

    // Die erste Handlung ist Weiterspielen. Der Knopf nennt, wohin er führt.
    const chapter = chapters().find(candidate => nextOpen(candidate, solved));
    const button = el('collection-continue');
    button.hidden = false;
    if (chapter) {
        const entry = nextOpen(chapter, solved);
        button.disabled = false;
        button.textContent = `Weiter: ${chapter.title}, ${entry.number}`;
        button.onclick = () => play(chapter, entry);
    } else {
        button.disabled = true;
        button.textContent = 'Alles gelöst';
        button.onclick = null;
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
