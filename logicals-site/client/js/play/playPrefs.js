/**
 * Play-time preferences.
 *
 * Deliberately separate from the booklet options: those describe the puzzle and
 * are handed to the generator, while these describe how the player wants to work
 * and must outlive any single puzzle. They are chosen on the settings screen
 * before starting and kept in local storage.
 */

const STORAGE_KEY = 'logicals.prefs.v1';

const DEFAULTS = {
    /**
     * Cross out the rest of the row and column when a cell is confirmed.
     *
     * On by default: those crosses are restatements of what "confirmed" means
     * rather than deductions, so doing them by hand is bookkeeping. Players who
     * would rather place every mark themselves can turn it off.
     */
    autoCross: true,
    /**
     * Hide the clock while playing.
     *
     * The timer keeps running and the result still records the time - this only
     * removes the sight of it. Visible time pressure is a barrier rather than a
     * feature for a good number of players, and the puzzle is the same either
     * way.
     */
    hideClock: false,
    /** Removes the competitive parts for anyone who does not want them. */
    hideDuel: false,
};

const BOOLEANS = Object.keys(DEFAULTS);

export function loadPrefs() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULTS };
        const saved = JSON.parse(raw);
        return Object.fromEntries(BOOLEANS.map(key => [
            key, typeof saved[key] === 'boolean' ? saved[key] : DEFAULTS[key],
        ]));
    } catch {
        // Private mode or corrupt storage - the defaults still play fine.
        return { ...DEFAULTS };
    }
}

export function savePrefs(prefs) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...DEFAULTS, ...prefs }));
    } catch { /* not being able to remember the choice must not break play */ }
}
