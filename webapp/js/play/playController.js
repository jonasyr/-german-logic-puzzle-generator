/**
 * Orchestrates the play screen: builds both views, keeps them painted in sync,
 * runs the clock, and persists progress.
 */

import { el, make, clear } from '../dom.js';
import { showScreen, onLeave } from '../router.js';
import { buildPager, categoryPairs } from './matrixView.js';
import { buildOverview, createZoom } from './overviewView.js';
import { createCluesSheet } from './cluesSheet.js';
import { createTimer, formatTime } from './playTimer.js';
import {
    MARK_SYMBOLS, createPlayState, storageKeyFor,
    cycleMark, undoMark, clearMarks, save, load,
} from './playState.js';

const { cellKey, buildTruthSet, evaluate } = window.PlayLogic;

const state = createPlayState();
/** key -> every button representing it (one in the pager, one in the overview). */
let cellsByKey = new Map();
let paused = false;
let sheet = null;
let zoom = null;
let timer = null;

/* --- Painting ------------------------------------------------------------- */

function paintCell(key) {
    const buttons = cellsByKey.get(key);
    if (!buttons) return;
    const mark = state.marks.get(key);
    const symbol = mark ? MARK_SYMBOLS[mark] : '';
    const isWrong = state.wrong.has(key);
    const description = mark === 'yes' ? 'sichere Zuordnung' : mark === 'no' ? 'ausgeschlossen' : 'leer';

    for (const button of buttons) {
        button.textContent = symbol;
        button.classList.toggle('is-yes', mark === 'yes');
        button.classList.toggle('is-no', mark === 'no');
        button.classList.toggle('is-wrong', isWrong);
        button.setAttribute('aria-label', `${button.dataset.label}: ${description}`);
    }
}

function paintAll() {
    for (const key of cellsByKey.keys()) paintCell(key);
}

function clearWrongMarks() {
    if (!state.wrong.size) return;
    const keys = [...state.wrong];
    state.wrong.clear();
    keys.forEach(paintCell);
}

function setStatus(message, isGood = false) {
    const node = el('play-status');
    node.textContent = message;
    node.classList.toggle('status-good', isGood);
    node.classList.remove('is-error');
}

function renderTimer(elapsedMs) {
    const node = el('play-timer');
    node.textContent = formatTime(elapsedMs);
    node.classList.toggle('is-paused', paused);
}

function renderUndo() {
    el('play-undo').disabled = paused || state.solved || state.undo.length === 0;
}

/** While paused the grid is locked and veiled, so no progress is made off the clock. */
function renderPauseState() {
    el('play-stage').classList.toggle('is-locked', paused);
    el('play-pause').textContent = paused ? 'Weiter' : 'Pause';
    el('play-check').disabled = paused;
    el('play-clear').disabled = paused;
    for (const buttons of cellsByKey.values()) {
        for (const button of buttons) button.disabled = paused;
    }
    renderUndo();
}

/** Ticks the completion marker on any pair whose "yes" marks are all placed. */
function renderPairProgress() {
    const nav = el('pager-nav');
    if (!nav.children.length || !state.puzzle) return;
    const valueCount = state.puzzle.categories[0].values.length;
    const pairs = categoryPairs(state.puzzle.categories.length);

    pairs.forEach(([a, b], index) => {
        let placed = 0;
        for (const [key, mark] of state.marks) {
            if (mark !== 'yes') continue;
            const [ca, cb] = key.split('.');
            if (Number(ca) === a && Number(cb) === b) placed++;
        }
        nav.children[index]?.classList.toggle('is-complete', placed === valueCount);
    });
}

/* --- Persistence ---------------------------------------------------------- */

function persist() {
    save(state, timer ? timer.elapsedMs() : 0);
}

/* --- Interaction ---------------------------------------------------------- */

function onCellActivate(key) {
    if (state.solved || paused) return;

    cycleMark(state, key);
    clearWrongMarks();
    paintCell(key);
    renderPairProgress();
    renderUndo();
    persist();

    if (evaluate(state.marks, state.truth).solved) handleSolved();
    else setStatus('');
}

function handleSolved() {
    state.solved = true;
    timer.stop();
    setStatus(`Gelöst in ${formatTime(timer.elapsedMs())}. Alle Zuordnungen stimmen.`, true);
    renderUndo();
    persist();
}

/**
 * Gate in front of checkNow. Revealing wrong marks can give a solution away, so
 * an accidental tap on "Prüfen" - which sits between four other toolbar buttons -
 * must not spoil the puzzle.
 */
function requestCheck() {
    if (!state.puzzle || paused) return;

    // Nothing is marked yet, so there is nothing to give away.
    if (state.marks.size === 0) { checkNow(); return; }

    const dialog = el('check-confirm');
    if (typeof dialog.showModal !== 'function') { checkNow(); return; }
    dialog.returnValue = '';
    dialog.showModal();
}

function checkNow() {
    if (!state.puzzle) return;
    const result = evaluate(state.marks, state.truth);
    state.wrong = result.wrong;
    paintAll();

    if (result.solved) { handleSolved(); return; }
    if (state.wrong.size > 0) {
        const label = state.wrong.size === 1 ? 'Markierung stimmt' : 'Markierungen stimmen';
        setStatus(`${state.wrong.size} ${label} nicht – rot hervorgehoben. Die Hervorhebung verschwindet, sobald du weiterspielst.`);
        return;
    }
    setStatus(`Bisher alles richtig. Es fehlen noch ${result.missing} sichere Zuordnungen.`, true);
}

function onUndo() {
    if (paused || state.solved) return;
    const key = undoMark(state);
    if (!key) return;
    clearWrongMarks();
    paintCell(key);
    renderPairProgress();
    renderUndo();
    setStatus('');
    persist();
}

function onClear() {
    clearMarks(state);
    paintAll();
    renderPairProgress();
    renderUndo();
    setStatus('');
    persist();
    if (!timer.isRunning() && !paused) timer.resume();
}

function togglePause() {
    if (state.solved) return;
    paused = !paused;
    if (paused) { timer.pause(); sheet?.collapse(); } else { timer.resume(); }
    renderTimer(timer.elapsedMs());
    renderPauseState();
    persist();
}

/** A stale scroll offset would leave the sticky corner covering a column header. */
function resetGridScroll() {
    const scroller = el('grid-scroll');
    scroller.scrollLeft = 0;
    scroller.scrollTop = 0;
}

function toggleView() {
    const screen = el('screen-play');
    const next = screen.dataset.view === 'pager' ? 'overview' : 'pager';
    screen.dataset.view = next;
    el('play-view').textContent = next === 'pager' ? 'Gesamt' : 'Einzeln';
    if (next === 'overview') {
        zoom?.reset();
        resetGridScroll();
    }
}

/* --- Solution table ------------------------------------------------------- */

function renderSolutionTable(puzzle) {
    const labels = puzzle.categories.map(category => category.label);
    const table = make('table', { className: 'data-table' });

    const headRow = make('tr');
    for (const label of labels) headRow.append(make('th', { text: label }));
    const thead = make('thead');
    thead.append(headRow);

    const tbody = make('tbody');
    for (const row of puzzle.solutionRows) {
        const tr = make('tr');
        for (const label of labels) tr.append(make('td', { text: row[label] }));
        tbody.append(tr);
    }

    table.append(thead, tbody);
    clear(el('play-solution-table')).append(table);
}

/* --- Entry point ---------------------------------------------------------- */

export function openPlay(puzzle) {
    state.puzzle = puzzle;
    state.storageKey = storageKeyFor(puzzle);
    state.marks = new Map();
    state.wrong = new Set();
    state.undo = [];
    state.usedClues = new Set();
    state.solved = false;
    state.truth = buildTruthSet(puzzle);
    paused = false;

    const restoredMs = load(state);

    el('play-title').textContent = `${puzzle.number}. ${puzzle.title}`;
    el('play-story').textContent = puzzle.story;
    el('play-goal').textContent = `Zielfrage: ${puzzle.targetQuestion}`;

    // Both views are built every time; each owns its own buttons for a key.
    cellsByKey = new Map();
    const pager = buildPager(puzzle, el('pager-track'), el('pager-nav'), {
        cellKey, onActivate: onCellActivate,
    });
    for (const [key, buttons] of pager.cells) cellsByKey.set(key, [...buttons]);

    const overview = buildOverview(puzzle, el('grid-zoom'), { cellKey, onActivate: onCellActivate });
    for (const [key, button] of overview.cells) {
        if (!cellsByKey.has(key)) cellsByKey.set(key, []);
        cellsByKey.get(key).push(button);
    }

    sheet.render(puzzle.clues, state.usedClues, persist);
    sheet.collapse();
    el('check-confirm').close();
    el('play-solution').open = false;
    renderSolutionTable(puzzle);

    el('screen-play').dataset.view = 'pager';
    el('play-view').textContent = 'Gesamt';
    el('pager-track').scrollLeft = 0;
    resetGridScroll();

    paintAll();
    renderPairProgress();
    renderPauseState();
    setStatus(state.solved ? 'Bereits gelöst.' : '', state.solved);

    showScreen('screen-play');

    if (state.solved) timer.reset(restoredMs);
    else timer.start(restoredMs);
    renderTimer(timer.elapsedMs());
}

export function initPlay() {
    timer = createTimer(renderTimer);

    sheet = createCluesSheet({
        sheet: el('clues-sheet'),
        handle: el('sheet-handle'),
        toggle: el('sheet-toggle'),
        list: el('play-clue-list'),
        backdrop: el('sheet-backdrop'),
        countNode: el('clue-count'),
    });

    zoom = createZoom(el('grid-zoom'), el('zoom-level'));
    el('zoom-in').addEventListener('click', () => zoom.in());
    el('zoom-out').addEventListener('click', () => zoom.out());

    el('play-check').addEventListener('click', requestCheck);

    // Only this button reveals anything. "Abbrechen", Esc and a programmatic
    // close all do nothing, because none of them run this handler. The dialog
    // closes by itself (form method="dialog"); acting on the click rather than
    // on the dialog's asynchronously dispatched "close" event keeps the reveal
    // tied to the deliberate press.
    el('check-confirm-ok').addEventListener('click', checkNow);
    el('play-undo').addEventListener('click', onUndo);
    el('play-clear').addEventListener('click', onClear);
    el('play-pause').addEventListener('click', togglePause);
    el('play-view').addEventListener('click', toggleView);

    // Leaving the play screen must stop the clock and flush progress.
    onLeave(from => {
        if (from !== 'screen-play') return;
        timer.stop();
        persist();
        sheet.collapse();
        el('check-confirm').close();
    });

    // iOS suspends timers when the tab is hidden; re-derive from timestamps on
    // return and flush before the page can be discarded.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') persist();
        else timer.refresh();
    });
    window.addEventListener('pageshow', () => timer.refresh());
    window.addEventListener('pagehide', persist);
}
