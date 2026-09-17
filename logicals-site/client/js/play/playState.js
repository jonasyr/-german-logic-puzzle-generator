/**
 * Marks, undo history and persistence for one puzzle.
 *
 * The mark cycle is unchanged from the original app: empty -> no -> yes -> empty.
 */

const UNDO_LIMIT = 50;

export const MARK_SYMBOLS = { yes: '○', no: '×' };

/** FNV-1a, 32 bit. Short, stable, and enough to tell two clue sets apart. */
function fingerprint(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(36);
}

/**
 * Theme, seed and dimensions alone do not identify a puzzle: regenerating with a
 * different difficulty or target category keeps all three but produces a
 * different clue list. Since usedClues is persisted as clue indexes, that would
 * strike through unrelated clues and restore marks for a different puzzle, so
 * the clue set is part of the key.
 */
export function storageKeyFor(puzzle, context = {}) {
    const dimensions = `${puzzle.categories.length}x${puzzle.categories[0].values.length}`;
    const clues = fingerprint(puzzle.clues.join('\0'));
    const mode = context.mode || 'solo';
    const player = context.player?.id || 'anonymous';
    const room = context.room?.id || 'none';
    return `logicals:play:${mode}:${room}:${player}:${puzzle.id}:${puzzle.seed}:${dimensions}:${clues}`;
}

export function createPlayState() {
    return {
        puzzle: null,
        storageKey: null,
        marks: new Map(),
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

/** Advances one cell through empty -> x -> o -> empty and records it for undo. */
export function cycleMark(state, key) {
    const previous = state.marks.get(key);
    if (previous === undefined) state.marks.set(key, 'no');
    else if (previous === 'no') state.marks.set(key, 'yes');
    else state.marks.delete(key);

    state.undo.push({ key, previous });
    if (state.undo.length > UNDO_LIMIT) state.undo.shift();
}

/** Reverts the last cycle. Returns the affected key, or null if there was none. */
export function undoMark(state) {
    const entry = state.undo.pop();
    if (!entry) return null;
    if (entry.previous === undefined) state.marks.delete(entry.key);
    else state.marks.set(entry.key, entry.previous);
    return entry.key;
}

export function clearMarks(state) {
    state.marks.clear();
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
