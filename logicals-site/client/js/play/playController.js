/**
 * Orchestrates the play screen: builds both views, keeps them painted in sync,
 * runs the clock, and persists progress.
 */

import { el, make, clear } from '../dom.js';
import { showScreen, onLeave } from '../router.js';
import { buildPager, categoryPairs } from './matrixView.js';
import { createOverviewCanvas } from './overview/overviewCanvas.js';
import { createCluesSheet } from './cluesSheet.js';
import { askConfirm, closeConfirm } from '../ui/confirmDialog.js';
import { createAuthoritativeTimer, createTimer, formatTime } from './playTimer.js';
import { createCompletionSubmission } from '../results/completion.js';
import { flushOutbox, queueResult } from '../results/outbox.js';
import { openDuelResult } from '../duel/duelResultController.js';
import {
    MARK_SYMBOLS, createPlayState, storageKeyFor,
    cycleMark, setMarkWith, undoMark, clearMarks, save, load, recordFailedCheck,
    resetForNewAttempt,
} from './playState.js';

const { cellKey, buildTruthSet, evaluate } = window.PlayLogic;

const state = createPlayState();
/** key -> the pager button representing it. */
let pagerCells = new Map();
/** Every view that paints marks. The pager owns buttons; the overview a canvas. */
let views = [];
let overview = null;
let paused = false;
let sheet = null;
let timer = null;

/* --- Painting ------------------------------------------------------------- */

function paintCell(key) {
    const mark = state.marks.get(key);
    const isWrong = state.wrong.has(key);

    const button = pagerCells.get(key);
    if (button) {
        const description = mark === 'yes' ? 'sichere Zuordnung' : mark === 'no' ? 'ausgeschlossen' : 'leer';
        button.textContent = mark ? MARK_SYMBOLS[mark] : '';
        button.classList.toggle('is-yes', mark === 'yes');
        button.classList.toggle('is-no', mark === 'no');
        button.classList.toggle('is-wrong', isWrong);
        button.setAttribute('aria-label', `${button.dataset.label}: ${description}`);
    }

    for (const view of views) view.paint(key, mark, isWrong);
}

function paintAll() {
    for (const key of pagerCells.keys()) paintCell(key);
}

/** Values per category, which the implication rules need. */
function valueCount() {
    return state.puzzle.categories[0].values.length;
}

/** Shared tail of every mark change, however it was made. */
function afterMarkChange(changed) {
    if (!changed.length) return;
    clearWrongMarks();
    changed.forEach(paintCell);
    renderPairProgress();
    renderUndo();
    persist();

    if (evaluate(state.marks, state.truth).solved) handleSolved();
    else setStatus('');
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
    for (const button of pagerCells.values()) button.disabled = paused;
    for (const view of views) view.setDisabled(paused);
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
    afterMarkChange(cycleMark(state, key, valueCount()));
}

/**
 * Sets a cell to an exact mark instead of cycling towards it.
 *
 * The overview's tool names the state it writes, so cycling to it would take up
 * to three taps and the button's label would be lying about what pressing it
 * does. Confirming a cell also crosses out the rest of its row and column; that
 * happens inside playState, as one undo step.
 */
function setMark(key, mark) {
    if (state.solved || paused) return;
    afterMarkChange(setMarkWith(state, key, mark, valueCount()));
}

function handleSolved() {
    state.solved = true;
    timer.stop();
    const elapsedMs = timer.elapsedMs();
    setStatus(`Gelöst in ${formatTime(elapsedMs)}. Alle Zuordnungen stimmen.`, true);
    renderUndo();
    persist();
    queueCompletion(elapsedMs).catch(error => console.error('Completion queue failed', error));
}

async function queueCompletion(elapsedMs) {
    if (state.resultQueued || !state.context?.player) return;
    const submission = await createCompletionSubmission({
        player: state.context.player,
        puzzle: state.puzzle,
        options: state.context.options,
        elapsedMs,
        failedChecks: state.failedChecks,
        attemptKey: state.attemptKey,
        room: state.context.room,
    });
    queueResult(submission);
    state.resultQueued = true;
    persist();
    await flushOutbox();
    if (state.context?.mode === 'duel') {
        openDuelResult({ room: state.context.room, player: state.context.player });
    }
}

/* --- Confirmation guards -------------------------------------------------- */

/**
 * Gate in front of checkNow. Revealing wrong marks can give a solution away, so
 * an accidental tap on "Prüfen" - which sits between three other toolbar
 * buttons - must not spoil the puzzle.
 */
function requestCheck() {
    if (!state.puzzle || paused) return;

    // Nothing is marked yet, so there is nothing to give away.
    if (state.marks.size === 0) { checkNow(); return; }

    askConfirm({
        title: 'Markierungen prüfen?',
        text: 'Falsche Markierungen werden rot hervorgehoben. Das kann dir Lösungswege verraten.',
        confirmLabel: 'Fehler anzeigen',
        onConfirm: checkNow,
    });
}

/** Gate in front of onClear, which throws away the whole grid and the undo history. */
function requestClear() {
    if (!state.puzzle || paused) return;

    // An empty grid has nothing to lose.
    if (state.marks.size === 0 && state.undo.length === 0) { onClear(); return; }

    const count = state.marks.size;
    askConfirm({
        title: 'Alle Markierungen löschen?',
        text: `${count} ${count === 1 ? 'Markierung wird' : 'Markierungen werden'} entfernt. `
            + 'Das lässt sich nicht rückgängig machen.',
        confirmLabel: 'Löschen',
        destructive: true,
        onConfirm: onClear,
    });
}

function checkNow() {
    if (!state.puzzle) return;
    const result = evaluate(state.marks, state.truth);
    state.wrong = result.wrong;
    paintAll();

    if (result.solved) { handleSolved(); return; }
    if (state.wrong.size > 0) {
        recordFailedCheck(state, state.wrong.size);
        persist();
        const label = state.wrong.size === 1 ? 'Markierung stimmt' : 'Markierungen stimmen';
        setStatus(`${state.wrong.size} ${label} nicht – rot hervorgehoben. Die Hervorhebung verschwindet, sobald du weiterspielst.`);
        return;
    }
    setStatus(`Bisher alles richtig. Es fehlen noch ${result.missing} sichere Zuordnungen.`, true);
}

function onUndo() {
    if (paused || state.solved) return;
    const changed = undoMark(state);
    if (!changed.length) return;
    clearWrongMarks();
    changed.forEach(paintCell);
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
    if (state.context?.mode !== 'duel' && !timer.isRunning() && !paused) timer.resume();
}

function togglePause() {
    if (state.solved) return;
    paused = !paused;
    if (state.context?.mode === 'duel') {
        timer.cover();
        if (paused) sheet?.collapse();
    } else if (paused) { timer.pause(); sheet?.collapse(); } else { timer.resume(); }
    renderTimer(timer.elapsedMs());
    renderPauseState();
    persist();
}

function toggleView() {
    const screen = el('screen-play');
    const next = screen.dataset.view === 'pager' ? 'overview' : 'pager';
    screen.dataset.view = next;
    el('play-view').textContent = next === 'pager' ? 'Gesamt' : 'Einzeln';
}

/* --- Solution table ------------------------------------------------------- */

/** Mid-puzzle the solution is the biggest spoiler of all, so it is gated too. */
function requestSolution() {
    if (!state.puzzle) return;
    askConfirm({
        title: 'Lösung anzeigen?',
        text: 'Du siehst die vollständige Lösung dieses Rätsels.',
        confirmLabel: 'Anzeigen',
        onConfirm: () => {
            renderSolutionTable(state.puzzle);
            el('play-solution-button').hidden = true;
        },
    });
}

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

export function openPlay(puzzle, context) {
    state.puzzle = puzzle;
    state.context = context;
    state.storageKey = storageKeyFor(puzzle, context);
    state.marks = new Map();
    state.auto = new Map();
    state.wrong = new Set();
    state.undo = [];
    state.usedClues = new Set();
    state.solved = false;
    state.attemptKey = null;
    state.failedChecks = 0;
    state.resultQueued = false;
    state.truth = buildTruthSet(puzzle);
    paused = false;

    timer?.stop();
    timer = context.mode === 'duel'
        ? createAuthoritativeTimer(context.room.startsAt - context.room.serverOffset, renderTimer)
        : createTimer(renderTimer);

    let restoredMs = load(state);
    if (state.solved && context.mode === 'duel') {
        openDuelResult({ room: context.room, player: context.player });
        return;
    }
    if (state.solved) {
        resetForNewAttempt(state);
        restoredMs = 0;
    }
    if (!state.attemptKey) state.attemptKey = crypto.randomUUID();

    el('play-title').textContent = `${puzzle.number}. ${puzzle.title}`;
    el('play-story').textContent = puzzle.story;
    el('play-goal').textContent = `Zielfrage: ${puzzle.targetQuestion}`;

    // Both views are built every time; the pager owns buttons, the overview a
    // canvas, and paintCell fans out over whatever is registered.
    overview?.destroy();
    pagerCells = new Map();
    const pager = buildPager(puzzle, el('pager-track'), el('pager-nav'), {
        cellKey, onActivate: onCellActivate,
    });
    for (const [key, buttons] of pager.cells) pagerCells.set(key, buttons[0]);

    overview = createOverviewCanvas({
        canvas: el('overview-canvas'),
        minimap: el('overview-minimap'),
        mirrorHost: el('overview-mirror'),
        readoutPair: el('overview-readout-pair'),
        readoutCats: el('overview-readout-cats'),
        markButtons: [el('overview-mark-no'), el('overview-mark-yes'), el('overview-mark-clear')],
        fitButton: el('overview-fit'),
        puzzle, cellKey, onSetMark: setMark,
    });
    views = [overview];

    sheet.render(puzzle.clues, state.usedClues, persist);
    sheet.collapse();
    closeConfirm();
    // The solution starts hidden behind its confirmation on every open.
    clear(el('play-solution-table'));
    el('play-solution-button').hidden = false;

    el('screen-play').dataset.view = 'overview';
    el('play-view').textContent = 'Einzeln';
    el('pager-track').scrollLeft = 0;

    paintAll();
    renderPairProgress();
    renderPauseState();
    setStatus(state.solved ? 'Bereits gelöst.' : '', state.solved);

    showScreen('screen-play');

    // The overview is hidden while it is built. Fit only after the active
    // screen has a real Safari layout box, otherwise every measurement is 0.
    requestAnimationFrame(() => overview?.fit());

    if (state.solved) timer.reset(restoredMs);
    else timer.start(restoredMs);
    renderTimer(timer.elapsedMs());
}

export function initPlay() {
    sheet = createCluesSheet({
        sheet: el('clues-sheet'),
        handle: el('sheet-handle'),
        header: el('sheet-toggle'),
        toggle: el('sheet-toggle'),
        list: el('play-clue-list'),
        body: el('sheet-body'),
        backdrop: el('sheet-backdrop'),
        countNode: el('clue-count'),
    });

    el('play-check').addEventListener('click', requestCheck);
    el('play-undo').addEventListener('click', onUndo);
    el('play-clear').addEventListener('click', requestClear);
    el('play-pause').addEventListener('click', togglePause);
    el('play-view').addEventListener('click', toggleView);
    el('play-solution-button').addEventListener('click', requestSolution);

    // Leaving the play screen must stop the clock and flush progress.
    onLeave(from => {
        if (from !== 'screen-play') return;
        timer.stop();
        persist();
        sheet.collapse();
        closeConfirm();
    });

    // iOS suspends timers when the tab is hidden; re-derive from timestamps on
    // return and flush before the page can be discarded.
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') persist();
        else timer?.refresh();
    });
    window.addEventListener('pageshow', () => timer?.refresh());
    window.addEventListener('pagehide', persist);
}
