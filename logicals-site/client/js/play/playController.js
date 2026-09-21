/**
 * Orchestrates the play screen: builds both views, keeps them painted in sync,
 * runs the clock, and persists progress.
 */

import { el, make, clear } from '../dom.js';
import { showScreen, onLeave, onEnter, onBackRequest } from '../router.js';
import { buildPager, categoryPairs } from './matrixView.js';
import { createOverviewCanvas } from './overview/overviewCanvas.js';
import { loadPrefs } from './playPrefs.js';
import { fingerprintPuzzle } from '../generation/canonicalPuzzle.ts';
import { clearResume, saveResume } from './resumeStore.js';
import { createMarkTool, nextMark } from './markTool.js';
import { createCluesSheet } from './cluesSheet.js';
import { askConfirm, closeConfirm } from '../ui/confirmDialog.js';
import { closeSolved, showSolved, showSolvedExperience } from '../ui/solvedDialog.js';
import { cachedExperience, loadExperience } from '../stats/experience.js';
import { levelAt } from '../stats/level.js';
import { entryAfter } from '../catalogue/catalogue.js';
import { opponentFinish } from '../duel/opponentState.js';
import { playCatalogueEntry } from '../screens/collectionScreen.js';
import { showFirstRunIfNeeded } from '../ui/firstRun.js';
import { createAuthoritativeTimer, createTimer, formatTime } from './playTimer.js';
import { createCompletionSubmission } from '../results/completion.js';
import { flushOutbox, queueResult } from '../results/outbox.js';
import { openDuelResult } from '../duel/duelResultController.js';
import { createProgressReporter } from '../duel/progressReporter.js';
import { forfeitDuel } from '../duel/roomApi.js';
import {
    MARK_SYMBOLS, createPlayState, soloContinuation, storageKeyFor,
    setMarkWith, undoMark, clearMarks, save, load, recordFailedCheck,
    resetForNewAttempt, firstWrongMark, knowsMarkOrder,
} from './playState.js';

const { cellKey, buildTruthSet, evaluate, findContradictions } = window.PlayLogic;

const state = createPlayState();
/** key -> the pager button representing it. */
let pagerCells = new Map();
/** Every view that paints marks. The pager owns buttons; the overview a canvas. */
let views = [];
let overview = null;
let paused = false;
let sheet = null;
let timer = null;
/** Computed once per puzzle; the resume record needs it and it is not cheap. */
let puzzleFingerprint = null;
/** The armed marking tool, shared by the pager and the overview. */
let tool = null;
/** Ob der fertige Gegner in diesem Spiel schon gemeldet wurde. */
let opponentAnnounced = false;
/** Duel only: reports this player's count and polls for the opponent's. */
let progress = null;
/** Recomputed after every change; 250 cells is nothing to scan. */
let conflicts = new Set();

/* --- Painting ------------------------------------------------------------- */

const MARK_DESCRIPTIONS = {
    yes: 'sichere Zuordnung',
    no: 'ausgeschlossen',
    maybe: 'vermutet',
};

function paintCell(key) {
    const mark = state.marks.get(key);
    const isWrong = state.wrong.has(key);

    const button = pagerCells.get(key);
    if (button) {
        // A note is a mark like any other. Reading it out as "leer" was left
        // over from before notes existed, and it made them invisible to anyone
        // using a screen reader even though the symbol was on screen.
        const description = MARK_DESCRIPTIONS[mark] ?? 'leer';
        /*
         * Eine Aussage zur Zeit.
         *
         * Solange eine Pruef-Hervorhebung steht, bleiben Widersprueche stumm.
         * Sonst sind im Gitter zwei Faerbungen, von denen die Meldung darueber
         * nur eine erklaert - eine Durchsicht hat das als Widerspruch gelesen,
         * und ein Spieler koennte das auch. Sobald weitermarkiert wird,
         * verschwindet die Pruefmarke und die Widersprueche kommen zurueck.
         */
        const conflicting = conflicts.has(key) && state.wrong.size === 0;
        button.textContent = mark ? MARK_SYMBOLS[mark] : '';
        button.classList.toggle('is-yes', mark === 'yes');
        button.classList.toggle('is-no', mark === 'no');
        button.classList.toggle('is-maybe', mark === 'maybe');
        button.classList.toggle('is-wrong', isWrong);
        button.classList.toggle('is-conflict', conflicting);
        // Said as well as shown: the status line reports how many marks
        // disagree, and there was no way at all to find out which.
        button.setAttribute('aria-label', `${button.dataset.label}: ${description}`
            + (conflicting ? ', widersprüchlich' : ''));
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

/**
 * Read per action rather than cached at open, so changing the setting in another
 * tab - or between puzzles - takes effect without a reload.
 */
function derivesCrosses() {
    return loadPrefs().autoCross;
}

/** Shared tail of every mark change, however it was made. */
function afterMarkChange(changed) {
    if (!changed.length) return;
    applyChange(changed);
    if (evaluate(state.marks, state.truth).solved) handleSolved();
    else reportConflicts();
}

/**
 * Recomputes the contradictions and says which cells changed their verdict.
 *
 * The canvas takes the whole set and repaints itself, but a pager cell is only
 * repainted when it is one of the cells that just changed - and a contradiction
 * always implicates cells nobody touched. Without this list the single-pair
 * view showed the count in the status line and no way to find out which marks
 * it meant.
 *
 * @returns {string[]} keys whose conflict state differs from before
 */
function refreshConflicts() {
    const previous = conflicts;
    conflicts = findContradictions(state.marks, state.puzzle.categories.length, valueCount());
    for (const view of views) view.setConflicts(conflicts);

    const flipped = [];
    for (const key of previous) if (!conflicts.has(key)) flipped.push(key);
    for (const key of conflicts) if (!previous.has(key)) flipped.push(key);
    return flipped;
}

/**
 * Says how many of the player's own marks disagree, or nothing.
 *
 * Not a spoiler, so it needs no gate: it reports only that the marks disagree
 * with each other, never which one is wrong.
 */
function reportConflicts() {
    const count = conflicts.size;
    setStatus(count === 0 ? ''
        : `${count} ${count === 1 ? 'Markierung widerspricht' : 'Markierungen widersprechen'} sich.`);
}

/** Repaint and bookkeeping shared by every mark change, however it was made. */
function applyChange(changed) {
    const flipped = refreshConflicts();
    clearWrongMarks();
    // A cell can be in both lists; a Set is cheaper than a guard.
    new Set([...changed, ...flipped]).forEach(paintCell);
    renderPairProgress();
    renderUndo();
    persist();
    // The opponent sees a count, never which cells.
    progress?.report(state.marks.size);
}

function clearWrongMarks() {
    if (!state.wrong.size) return;
    const keys = [...state.wrong];
    state.wrong.clear();
    keys.forEach(paintCell);
}

/*
 * Die Zeile sagt etwas - oder sie ist weg.
 *
 * Hier stand einmal eine Ruhefassung ("Tippen schliesst aus."), damit die Zeile
 * dauerhaft Platz belegen und eine erscheinende Meldung das Gitter nicht
 * verschieben konnte. Der Platz war den Preis nicht wert: auf dem Telefon
 * kostete die Reservierung rund 44px Gitterhoehe, an der einen Stelle, an der
 * die App wirklich Platz braucht. Das Gitter so gross wie moeglich zu halten
 * wiegt schwerer als ein ruhiges Layout - der Sprung beim Pruefen ist bewusst
 * in Kauf genommen.
 *
 * Verdeckt wird trotzdem nichts: die Zeile steht im Fluss UEBER dem Gitter,
 * nicht darauf. Das war der eigentliche Fehler, und der bleibt behoben.
 */
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
    tool?.setDisabled(paused);
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
    const elapsedMs = timer ? timer.elapsedMs() : 0;
    save(state, elapsedMs);
    rememberForResume(elapsedMs);
}

/**
 * Keeps the resume record in step with the live game.
 *
 * Solo only: a duel has its own session store, its own expiry, and a room that
 * may be gone by the time anyone comes back. And a solved or empty grid is not
 * something to come back TO, so both clear the record rather than leaving a
 * button that leads nowhere interesting.
 */
function rememberForResume(elapsedMs) {
    if (state.context?.mode !== 'solo' || !state.context?.player) return;
    if (state.solved || state.marks.size === 0 || !puzzleFingerprint) {
        clearResume();
        return;
    }
    saveResume({
        options: state.context.options,
        puzzleIndex: state.context.puzzleIndex ?? 0,
        fingerprint: puzzleFingerprint,
        storageKey: state.storageKey,
        playerId: state.context.player.id,
        title: `${state.puzzle.number}. ${state.puzzle.title}`,
        savedAt: new Date().toISOString(),
        elapsedMs,
        markCount: state.marks.size,
    });
}

/* --- Interaction ---------------------------------------------------------- */

/**
 * A tap in either view writes the armed tool.
 *
 * The pager used to cycle instead, which meant the two views disagreed about
 * what a tap does - and once a note mark exists, the pager could neither place
 * nor clear one.
 */
function onCellActivate(key) {
    if (state.solved || paused) return;
    const mark = nextMark(state.marks.get(key), tool?.current());
    if (mark === undefined) return;
    afterMarkChange(setMarkWith(state, key, mark, valueCount(), derivesCrosses()));
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
    afterMarkChange(setMarkWith(state, key, mark, valueCount(), derivesCrosses()));
}

function handleSolved() {
    state.solved = true;
    timer.stop();
    const elapsedMs = timer.elapsedMs();
    setStatus(`Gelöst in ${formatTime(elapsedMs)}. Alle Zuordnungen stimmen.`, true);
    renderUndo();
    persist();
    /*
     * Die Zusage festhalten, nicht nur feuern und vergessen: der
     * Erfahrungsstand darf erst danach geholt werden, sonst kennt der Server
     * dieses Raetsel noch nicht und der Zuwachs waere null.
     */
    const queued = queueCompletion(elapsedMs)
        .catch(error => console.error('Completion queue failed', error));

    // A duel has its own result screen, with the other player on it. Solo had
    // nothing at all - the moment the whole screen is built for passed with a
    // line of status text and no way back to the start.
    if (state.context?.mode === 'duel') return;
    /*
     * Der Stand VOR diesem Raetsel, gemerkt bevor das Ergebnis abgeschickt
     * wird. Der Zuwachs ist dann schlicht die Differenz zum frischen Stand -
     * so muss die Formel nicht auch im Client stehen, sondern bleibt allein
     * im Worker, der ueber alle Ergebnisse summieren kann.
     */
    const vorher = state.context?.player
        ? cachedExperience(state.context.player.id)
        : null;
    showSolved({
        title: `${state.puzzle.number}. ${state.puzzle.title}`,
        time: formatTime(elapsedMs),
        failedChecks: state.failedChecks,
        marks: state.marks.size,
        onHome: () => showScreen('screen-start'),
        /*
         * Weiter statt hinaus.
         *
         * Wer gerade Nummer 1 von 12 geloest hat, will das naechste - nicht
         * den Startbildschirm. Woher das Raetsel kam, muss sich das Spiel
         * dabei nicht merken: der Seed steht in seinen Optionen, und der
         * Katalog weiss den Rest. Gibt es kein naechstes (freies Spiel,
         * Tagesraetsel, Kapitelende), bleibt der Knopf weg.
         */
        onNext: naechsterEintrag(),
    });
    reportExperience(vorher, queued).catch(error => console.error('Experience failed', error));
}

/**
 * Traegt den Erfahrungsstand im Gelöst-Dialog nach.
 *
 * Erst nachdem das Ergebnis in der Warteschlange ist - vorher kennt der Server
 * dieses Raetsel noch nicht und der Zuwachs waere null. Schlaegt irgendetwas
 * davon fehl, bleibt der Block weg: eine falsche Zahl waere schlechter als
 * keine.
 */
async function reportExperience(vorher, queued) {
    const player = state.context?.player;
    if (!player) return;

    await queued;
    const jetzt = await loadExperience(player.id);
    if (!jetzt) return;

    const stufe = levelAt(jetzt.xp);
    showSolvedExperience({
        gain: vorher ? jetzt.xp - vorher.xp : null,
        xp: jetzt.xp,
        level: stufe.level,
        intoLevel: stufe.intoLevel,
        levelSpan: stufe.levelSpan,
    });
}

/**
 * Meldet den fertigen Gegner und laesst den Spieler entscheiden.
 *
 * Weiterspielen schliesst nur - die eigene Zeit zaehlt weiter. "Spaeter
 * beenden" schreibt einen Fortsetzungs-Datensatz und geht zur Startseite;
 * dort steht das Raetsel dann unter "Weiterspielen" wie ein Einzelspiel.
 *
 * Der Datensatz muss hier ausdruecklich geschrieben werden: rememberForResume
 * steigt bei mode !== 'solo' sofort aus, ein Duell schreibt also von sich aus
 * nie eine Fortsetzung. Ohne das fuehrte "Spaeter beenden" ins Nichts.
 */
function announceOpponent({ displayName, elapsedMs }) {
    el('opponent-title').textContent = `${displayName} ist fertig – in ${formatTime(elapsedMs)}`;
    el('opponent-later').onclick = () => {
        /*
         * Den Zwischenstand mitnehmen.
         *
         * Der Speicherschluessel traegt Modus und Raumnummer, ein Duell
         * speichert also unter "duel:<raum>" und das fortgesetzte Einzelspiel
         * sucht unter "solo:none". Ohne diesen Schritt faende man beim
         * Weiterspielen ein leeres Gitter - die Markierungen laegen noch da,
         * nur unter einem Schluessel, den niemand mehr liest.
         */
        const soloKey = storageKeyFor(state.puzzle, {
            mode: 'solo', player: state.context.player,
        });
        try {
            const roh = localStorage.getItem(state.storageKey);
            if (roh) {
                localStorage.setItem(soloKey,
                    JSON.stringify(soloContinuation(JSON.parse(roh))));
            }
        } catch {
            // Privater Modus oder voller Speicher: dann faengt man eben neu
            // an. Besser als gar kein Weg zurueck.
        }

        saveResume({
            options: state.context.options,
            puzzleIndex: state.context.puzzleIndex ?? 0,
            fingerprint: puzzleFingerprint,
            // Der Schluessel des Einzelspiels, nicht der des Duells - sonst
            // zeigte der Datensatz auf einen Stand, den openPlay nie laedt.
            storageKey: soloKey,
            playerId: state.context.player.id,
            title: `${state.puzzle.number}. ${state.puzzle.title}`,
            savedAt: new Date().toISOString(),
            elapsedMs: timer ? timer.elapsedMs() : 0,
            markCount: state.marks.size,
        });

        /*
         * Dem Gegner Bescheid geben, dass hier niemand mehr kommt.
         *
         * Ohne das bliebe er in „Warte auf ..." stehen, bis der Raum nach
         * 24 Stunden verfaellt. Absichtlich ohne await und ohne Fehlerpfad:
         * der Weg zurueck ins Einzelspiel darf nicht am Netz haengen, und
         * der eigene Stand liegt schon im Speicher.
         */
        forfeitDuel(state.context.room.code, {
            playerId: state.context.player.id,
            memberToken: state.context.room.memberToken,
        }).catch(() => {});

        showScreen('screen-start');
    };
    const dialog = el('opponent-dialog');
    if (typeof dialog.showModal === 'function') dialog.showModal();
}

/** Der Griff zum naechsten Katalogeintrag - oder null. */
function naechsterEintrag() {
    const folgend = entryAfter(state.context?.options?.seed);
    if (!folgend) return null;
    return () => playCatalogueEntry(folgend.chapter, folgend.entry);
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
        text: 'Die erste falsche Markierung wird hervorgehoben. '
            + 'Wie viele es insgesamt sind, erfährst du dazu.',
        confirmLabel: 'Stelle zeigen',
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
    /*
     * Nur eine Stelle hervorheben, nicht alle.
     *
     * Alle auf einmal rot zu färben verriet halbe Lösungswege - daher die
     * Warnung im Bestätigungsdialog. Eine Stelle sagt „hier ist es gekippt",
     * und das ist das, was man wissen will.
     *
     * state.wrong traegt deshalb nur diese eine; alles Weitere - Malen,
     * Zuruecknehmen, Aufraeumen - folgt daraus von selbst.
     */
    const earliest = firstWrongMark(state, result.wrong);
    state.wrong = earliest ? new Set([earliest]) : new Set();
    paintAll();

    if (result.solved) { handleSolved(); return; }
    if (result.wrong.size > 0) {
        recordFailedCheck(state, result.wrong.size);
        persist();
        const count = result.wrong.size;
        const label = count === 1 ? 'Markierung stimmt' : 'Markierungen stimmen';
        /*
         * Kurz halten - die Zeile liegt ÜBER dem Gitter.
         *
         * Die erste Fassung hängte "Die erste davon ist hervorgehoben." an den
         * bisherigen Satz an, ohne etwas zu streichen. Bei 320x568 wurden
         * daraus vier Zeilen, die das gesamte Gitter verdeckten - samt der
         * hervorgehobenen Stelle, von der die Meldung gerade sprach.
         *
         * Dass die Hervorhebung beim Weiterspielen verschwindet, lernt man
         * einmal und liest es danach nie wieder; es kostete zwei Zeilen.
         */
        const which = knowsMarkOrder(state) ? 'die erste ist' : 'eine ist';
        setStatus(`${count} ${label} nicht – ${which} hervorgehoben.`);
        return;
    }
    setStatus(`Bisher alles richtig. Es fehlen noch ${result.missing} sichere Zuordnungen.`, true);
}

function onUndo() {
    if (paused || state.solved) return;
    const changed = undoMark(state);
    if (!changed.length) return;
    applyChange(changed);
    // Undoing cannot solve the puzzle, but it can leave a contradiction standing.
    // Clearing the status unconditionally used to hide one.
    reportConflicts();
}

function onClear() {
    clearMarks(state);
    conflicts = new Set();
    for (const view of views) view.setConflicts(conflicts);
    progress?.report(0);
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
    conflicts = new Set();
    // Asynchronous, and only the resume record needs it, so the game does not
    // wait for it. Until it lands, rememberForResume simply skips.
    puzzleFingerprint = null;
    fingerprintPuzzle(puzzle)
        .then(value => { puzzleFingerprint = value; })
        .catch(() => { puzzleFingerprint = null; });
    paused = false;

    progress?.stop();
    // Jedes Spiel meldet seinen Gegner neu. Ohne das Zuruecksetzen bliebe die
    // Meldung ab dem zweiten Duell aus.
    opponentAnnounced = false;
    progress = context.mode === 'duel'
        ? createProgressReporter({
            room: context.room,
            player: context.player,
            onOpponent: member => {
                const filled = member.filled;
                if (filled === null || filled === undefined) return;
                // Only the text changes. The line itself is already in flow, so
                // the first report cannot resize the grid mid-game.
                el('duel-progress').textContent = `Gegner: ${filled} Felder gesetzt`;
            },
            onRoom: room => {
                /*
                 * Einmalig. Der Raum meldet den Abschluss bei jedem Poll
                 * weiter; ein Dialog, der alle fuenf Sekunden wiederkommt,
                 * waere schlimmer als gar keiner.
                 */
                if (opponentAnnounced || state.solved) return;
                const fertig = opponentFinish(room, context.player.id);
                if (!fertig) return;
                opponentAnnounced = true;
                announceOpponent(fertig);
            },
        })
        : null;

    // Present but empty for the whole duel; absent entirely in solo, where it
    // would only cost a line that nothing is ever going to fill.
    const progressNode = el('duel-progress');
    progressNode.hidden = context.mode !== 'duel';
    progressNode.textContent = '';

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

    // The timer keeps running and the result still records the time; this only
    // removes the sight of it.
    el('play-timer').hidden = loadPrefs().hideClock;
    el('play-title').textContent = `${puzzle.number}. ${puzzle.title}`;
    el('play-story').textContent = puzzle.story;
    /*
     * Die Zielfrage an beiden Orten.
     *
     * Ueber dem Gitter, solange Platz ist - und im Hinweisblatt immer. Das
     * Querformat blendet die Kopfzeile aus, und auf dem Telefon weicht sie dem
     * Gitter; ohne die zweite Stelle waere die Frage dann schlicht weg, was sie
     * im Querformat bisher auch war. Im Blatt steht sie am richtigen Ort: sie
     * ist die Frage, auf die die Hinweise antworten.
     */
    const zielfrage = `Zielfrage: ${puzzle.targetQuestion}`;
    el('play-goal').textContent = zielfrage;
    el('play-goal-sheet').textContent = zielfrage;

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
        fitButton: el('overview-fit'),
        puzzle, cellKey, currentTool: () => tool.current(), onSetMark: setMark,
    });
    views = [overview];

    sheet.render(puzzle.clues, state.usedClues, persist);
    sheet.collapse();
    closeConfirm();
    closeSolved();
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

    // Erst jetzt: die Erklärung handelt vom Gitter, das gerade erschienen ist.
    showFirstRunIfNeeded();

    if (state.solved) timer.reset(restoredMs);
    else timer.start(restoredMs);
    renderTimer(timer.elapsedMs());
}

/**
 * Darf das Spiel gerade verlassen werden?
 *
 * Nur das Duell fragt nach. Es ist der einzige Zustand, den das Verlassen
 * unwiederbringlich kostet - und ausgerechnet er war ungesichert, während
 * "Prüfen" und "Löschen" längst je einen Dialog hatten. Die Absicherung war
 * invers zum Risiko.
 *
 * Der Router ruft das sowohl für den Knopf als auch für die System-Geste auf,
 * also kann es keine zwei Antworten geben.
 *
 * @returns {boolean} false lehnt ab und hat die Rückfrage geöffnet
 */
function mayLeavePlay() {
    if (state.context?.mode !== 'duel' || state.solved) return true;
    askConfirm({
        title: 'Duell verlassen?',
        text: 'Das Duell läuft weiter und die Zeit ebenfalls. Dein Gegner spielt zu Ende.',
        confirmLabel: 'Verlassen',
        destructive: true,
        onConfirm: () => showScreen('screen-start'),
    });
    return false;
}

export function initPlay() {
    tool = createMarkTool({
        buttons: [
            el('overview-mark-no'), el('overview-mark-yes'),
            el('overview-mark-maybe'), el('overview-mark-clear'),
        ],
        /*
         * Das Werkzeug wegzulegen ist ein stiller vierter Zustand: danach bleibt
         * jeder Tipp auf dem Gitter wirkungslos, und nichts sagte, warum. Die
         * Statuszeile ist ein Overlay, kann das Gitter also nicht verdrängen.
         *
         * createMarkTool ruft render() - und damit onChange - schon im
         * Konstruktor auf, bevor initPlay fertig ist. Unkritisch, weil das
         * Startwerkzeug 'no' ist und der Zweig dann nur eine ohnehin leere
         * Zeile leert. Die Reihenfolge nicht ohne diesen Punkt ändern.
         */
        onChange: current => {
            /*
             * Das Werkzeug wegzulegen ist ein stiller Zustand: danach bleibt
             * jeder Tipp auf dem Gitter wirkungslos, und nichts sagte, warum.
             * Nur dafuer erscheint hier eine Meldung - und sie verschwindet
             * wieder, sobald ein Werkzeug aufgenommen wird. Eine echte
             * Pruef-Meldung bleibt dabei stehen: wer nach dem Pruefen das
             * Werkzeug wechselt, um die gefundene Stelle zu berichtigen, soll
             * nicht verlieren, was dort steht.
             */
            if (!current) setStatus('Kein Werkzeug gewählt – tippe eines unten an.');
            else if (el('play-status').textContent.startsWith('Kein Werkzeug')) setStatus('');
        },
    });

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

    // Der Knopf trägt kein data-goto; der Router verdrahtet ihn über btn--back
    // auf denselben Weg wie die Wisch-Geste. Hier hängt nur die Rückfrage.
    onBackRequest(from => (from === 'screen-play' ? mayLeavePlay() : true));

    // Die Uhr wurde nur beim Öffnen eines Rätsels gelesen. Seit die Vorliebe aus
    // dem laufenden Spiel heraus erreichbar ist, muss sie beim Zurückkommen
    // greifen - sonst schaltet man sie um und nichts passiert.
    onEnter(id => {
        if (id !== 'screen-play' || !state.puzzle) return;
        el('play-timer').hidden = loadPrefs().hideClock;
        // Und neu einpassen. Das Canvas misst sich an seinem Layoutkasten, und
        // der ist Null, solange der Bildschirm inaktiv ist - wer weggeht und
        // zurückkommt, fand sonst ein Gitter vor, das nicht mehr zu seinem
        // Ausschnitt passte. Erst nach dem Umschalten, wie bei openPlay.
        requestAnimationFrame(() => overview?.fit());
    });

    el('play-check').addEventListener('click', requestCheck);
    el('play-undo').addEventListener('click', onUndo);
    el('play-clear').addEventListener('click', requestClear);
    el('play-pause').addEventListener('click', togglePause);
    /*
     * Der Tipp auf die verhuellte Buehne spielt weiter.
     *
     * Im Pausenzustand ist die Buehne die groesste Flaeche des Schirms und war
     * die einzige ohne Funktion: zurueck ging es nur ueber den Knopf oben in
     * der Leiste, der dafuer still von "Pause" in "Weiter" umbenannt wurde.
     * Der Knopf bleibt, dies ist der naheliegende zweite Weg.
     */
    el('play-stage').addEventListener('click', () => { if (paused) togglePause(); });
    el('play-view').addEventListener('click', toggleView);
    el('play-solution-button').addEventListener('click', requestSolution);

    // Leaving the play screen must stop the clock and flush progress.
    onLeave(from => {
        if (from !== 'screen-play') return;
        progress?.stop();
        progress = null;
        timer.stop();
        persist();
        sheet.collapse();
        closeConfirm();
        closeSolved();
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
