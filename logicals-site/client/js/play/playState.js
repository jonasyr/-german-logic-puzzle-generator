/**
 * Marks, undo history and persistence for one puzzle.
 *
 * The mark cycle is unchanged from the original app: empty -> no -> yes -> empty.
 *
 * Confirming a cell also crosses out the rest of its row and column inside the
 * same 5x5 block, because in a logic grid those are not deductions - they are
 * restatements of what "confirmed" means. Doing it by hand is eight taps of
 * bookkeeping per confirmation and adds nothing.
 *
 * Withdrawing the confirmation withdraws those crosses again, which needs
 * provenance: `state.auto` maps a derived cross to the set of confirmations that
 * justify it. A cross the player placed themselves has no entry and is never
 * touched, and one justified by two confirmations survives losing either.
 */

import { fnv1a36 } from '../util/hash.js';

const UNDO_LIMIT = 50;

/** `maybe` is the player's own uncertainty; scoring ignores it by construction. */
export const MARK_SYMBOLS = { yes: '○', no: '×', maybe: '·' };

/**
 * Theme, seed and dimensions alone do not identify a puzzle: regenerating with a
 * different difficulty or target category keeps all three but produces a
 * different clue list. Since usedClues is persisted as clue indexes, that would
 * strike through unrelated clues and restore marks for a different puzzle, so
 * the clue set is part of the key.
 */
export function storageKeyFor(puzzle, context = {}) {
    const dimensions = `${puzzle.categories.length}x${puzzle.categories[0].values.length}`;
    const clues = fnv1a36(puzzle.clues.join('\0'));
    const mode = context.mode || 'solo';
    const player = context.player?.id || 'anonymous';
    const room = context.room?.id || 'none';
    return `logicals:play:${mode}:${room}:${player}:${puzzle.id}:${puzzle.seed}:${dimensions}:${clues}`;
}

/**
 * Every cell that a confirmation at `key` trivially excludes: the rest of its
 * row and the rest of its column, inside that block only.
 *
 * Keys are `categoryA.categoryB.valueA.valueB` with the lower category first
 * (see playLogic.js), so the block and both coordinates come straight out of the
 * key and no puzzle lookup is needed.
 */
export function impliedKeys(key, valueCount) {
    const [categoryA, categoryB, valueA, valueB] = key.split('.');
    const a = Number(valueA);
    const b = Number(valueB);
    const implied = [];
    for (let value = 0; value < valueCount; value++) {
        if (value !== b) implied.push(`${categoryA}.${categoryB}.${a}.${value}`);
        if (value !== a) implied.push(`${categoryA}.${categoryB}.${value}.${b}`);
    }
    return implied;
}

export function createPlayState() {
    return {
        puzzle: null,
        storageKey: null,
        marks: new Map(),
        /** derived cross -> the confirmations justifying it. */
        auto: new Map(),
        truth: new Set(),
        wrong: new Set(),
        undo: [],
        usedClues: new Set(),
        solved: false,
        attemptKey: null,
        failedChecks: 0,
        resultQueued: false,
        context: null,
    };
}

export function recordFailedCheck(state, wrongCount) {
    if (wrongCount > 0) state.failedChecks += 1;
}

/**
 * Sets one cell and maintains the crosses its confirmation implies.
 *
 * The whole change - the cell, every cross added or withdrawn, and the
 * provenance behind them - goes onto the undo stack as ONE entry, so a single
 * tap costs a single undo.
 *
 * `deriveCrosses` governs only whether NEW crosses are derived. Withdrawing
 * always follows the recorded provenance, whatever the setting says now:
 * turning the help off must not strand crosses that nothing explains any more.
 *
 * @returns {string[]} every key whose mark changed, for repainting.
 */
export function setMarkWith(state, key, mark, valueCount, deriveCrosses = true) {
    const previous = state.marks.get(key) ?? null;
    if (previous === mark) return [];

    const marks = [];
    const auto = [];
    const recordMark = k => marks.push({ key: k, previous: state.marks.get(k) ?? null });
    const recordAuto = k => auto.push({
        key: k,
        previous: state.auto.has(k) ? new Set(state.auto.get(k)) : null,
    });

    // Leaving 'yes' retires the crosses this confirmation was holding up.
    if (previous === 'yes') {
        for (const implied of impliedKeys(key, valueCount)) {
            const sources = state.auto.get(implied);
            if (!sources || !sources.has(key)) continue;
            recordAuto(implied);
            sources.delete(key);
            if (sources.size === 0) {
                state.auto.delete(implied);
                // Only withdraw the cross itself; anything else the player has
                // since put there is theirs to keep.
                if (state.marks.get(implied) === 'no') {
                    recordMark(implied);
                    state.marks.delete(implied);
                }
            }
        }
    }

    // Touching a cell directly makes it the player's own. Without this, a derived
    // cross that they cleared and later re-drew by hand would keep its stale
    // provenance and vanish again with the confirmation behind it.
    if (state.auto.has(key)) {
        recordAuto(key);
        state.auto.delete(key);
    }

    recordMark(key);
    if (mark === null) state.marks.delete(key); else state.marks.set(key, mark);

    // Entering 'yes' crosses out the rest of the row and column.
    if (mark === 'yes' && deriveCrosses) {
        for (const implied of impliedKeys(key, valueCount)) {
            const current = state.marks.get(implied);
            // A cell the player already decided is left exactly as it is - a
            // manual cross keeps no provenance, so it outlives this confirmation.
            if (current !== undefined) continue;
            recordMark(implied);
            recordAuto(implied);
            state.marks.set(implied, 'no');
            state.auto.set(implied, new Set([key]));
        }
        // A cross that was already derived gains this confirmation as a second
        // justification, so losing the first one does not withdraw it.
        for (const implied of impliedKeys(key, valueCount)) {
            const sources = state.auto.get(implied);
            if (sources && !sources.has(key)) {
                if (!auto.some(entry => entry.key === implied)) recordAuto(implied);
                sources.add(key);
            }
        }
    }

    state.undo.push({ marks, auto });
    if (state.undo.length > UNDO_LIMIT) state.undo.shift();
    return marks.map(entry => entry.key);
}

/**
 * Reverts the last change as a whole.
 * @returns {string[]} the affected keys, empty when there was nothing to undo.
 */
export function undoMark(state) {
    const entry = state.undo.pop();
    if (!entry) return [];

    for (const { key, previous } of entry.auto) {
        if (previous === null) state.auto.delete(key);
        else state.auto.set(key, new Set(previous));
    }
    for (const { key, previous } of entry.marks) {
        if (previous === null) state.marks.delete(key);
        else state.marks.set(key, previous);
    }
    return entry.marks.map(change => change.key);
}

export function clearMarks(state) {
    state.marks.clear();
    state.auto.clear();
    state.wrong.clear();
    state.undo.length = 0;
    state.solved = false;
}

export function resetForNewAttempt(state) {
    clearMarks(state);
    state.usedClues.clear();
    state.attemptKey = null;
    state.failedChecks = 0;
    state.resultQueued = false;
}

export function save(state, elapsedMs) {
    if (!state.storageKey) return;
    try {
        localStorage.setItem(state.storageKey, JSON.stringify({
            marks: [...state.marks],
            // Without provenance a reload would strand the derived crosses:
            // taking a confirmation back would no longer withdraw them.
            auto: [...state.auto].map(([key, sources]) => [key, [...sources]]),
            usedClues: [...state.usedClues],
            elapsedMs,
            solved: state.solved,
            attemptKey: state.attemptKey,
            failedChecks: state.failedChecks,
            resultQueued: state.resultQueued,
        }));
    } catch { /* private mode or storage full - playing still works */ }
}

/** Returns the restored elapsed milliseconds, or 0 when there was nothing to load. */
export function load(state) {
    try {
        const raw = localStorage.getItem(state.storageKey);
        if (!raw) return 0;
        const saved = JSON.parse(raw);
        if (Array.isArray(saved.marks)) state.marks = new Map(saved.marks);
        state.auto = new Map(
            Array.isArray(saved.auto)
                ? saved.auto.map(([key, sources]) => [key, new Set(sources)])
                : [],
        );
        if (Array.isArray(saved.usedClues)) state.usedClues = new Set(saved.usedClues);
        state.solved = Boolean(saved.solved);
        state.attemptKey = typeof saved.attemptKey === 'string' ? saved.attemptKey : null;
        state.failedChecks = Number.isSafeInteger(saved.failedChecks) && saved.failedChecks >= 0
            ? saved.failedChecks
            : 0;
        state.resultQueued = Boolean(saved.resultQueued);

        if (Number.isFinite(saved.elapsedMs)) return saved.elapsedMs;
        // Pre-1.5 saves counted whole seconds under a different key.
        if (Number.isFinite(saved.seconds)) return saved.seconds * 1000;
        return 0;
    } catch {
        return 0;
    }
}
