/**
 * FNV-1a, 32 bit.
 *
 * Lifted unchanged out of playState.js, where it fingerprints clue sets for
 * storage keys. Its output is therefore load-bearing: a different hash would
 * orphan every saved game on every device. The daily puzzle needs the numeric
 * form, hence the pair.
 */

export function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** The short, stable spelling that storage keys are built from. */
export function fnv1a36(text) {
    return fnv1a(text).toString(36);
}
