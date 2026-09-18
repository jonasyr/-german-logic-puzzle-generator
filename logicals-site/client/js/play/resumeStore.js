/**
 * The one unfinished solo game, remembered well enough to rebuild it.
 *
 * Puzzles are generated at runtime and never stored, so resuming means
 * regenerating - which is exactly what the duel already does with a room's
 * configuration and puzzle index, verifying the result by fingerprint before
 * trusting it. This record carries the same ingredients for a solo game.
 *
 * One slot, not a list. Finished games live in the history screen; this is for
 * the game you were in the middle of, and a list would need management UI for a
 * situation that hardly arises.
 */

export const RESUME_KEY = 'logicals.resume.v1';

/** Everything that must be present for a resume to even be attempted. */
const REQUIRED = ['options', 'puzzleIndex', 'fingerprint', 'storageKey', 'playerId'];

export function saveResume(record) {
    try {
        localStorage.setItem(RESUME_KEY, JSON.stringify(record));
    } catch { /* private mode or full storage - playing on is more important */ }
}

export function loadResume(playerId) {
    try {
        const raw = localStorage.getItem(RESUME_KEY);
        if (!raw) return null;
        const record = JSON.parse(raw);
        if (REQUIRED.some(field => record?.[field] === undefined || record[field] === null)) {
            return null;
        }
        // Another player's game would be filed under the wrong name on completion.
        if (record.playerId !== playerId) return null;
        return record;
    } catch {
        return null;
    }
}

export function clearResume() {
    try {
        localStorage.removeItem(RESUME_KEY);
    } catch { /* nothing to do and nothing worth breaking play over */ }
}
