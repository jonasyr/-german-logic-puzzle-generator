/**
 * Marks, undo history and persistence for one puzzle.
 *
 * The mark cycle is unchanged from the original app: empty -> no -> yes -> empty.
 */

const UNDO_LIMIT = 50;

export const MARK_SYMBOLS = { yes: '○', no: '×' };

export function storageKeyFor(puzzle) {
    const dimensions = `${puzzle.categories.length}x${puzzle.categories[0].values.length}`;
    return `logicals:play:${puzzle.id}:${puzzle.seed}:${dimensions}`;
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
    };
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

export function save(state, elapsedMs) {
    if (!state.storageKey) return;
    try {
        localStorage.setItem(state.storageKey, JSON.stringify({
            marks: [...state.marks],
            usedClues: [...state.usedClues],
            elapsedMs,
            solved: state.solved,
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

        if (Number.isFinite(saved.elapsedMs)) return saved.elapsedMs;
        // Pre-1.5 saves counted whole seconds under a different key.
        if (Number.isFinite(saved.seconds)) return saved.seconds * 1000;
        return 0;
    } catch {
        return 0;
    }
}
