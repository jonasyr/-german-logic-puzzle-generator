/** Settings screen: option loading, palette presets and the generate request. */

import { el, setHint, fillRange, fillOptions } from '../dom.js';
import { fetchOptions } from '../api.js';
import { loadPrefs, savePrefs } from '../play/playPrefs.js';

/**
 * Kept because collectOptions still sends colours to the generator, even though
 * no screen offers a choice of them any more. Playing is unaffected by all of
 * this; only a PDF would be.
 */
export const PALETTES = {
    klassik: { accent: '#C6492D', secondary: '#227C78', ink: '#172033' },
};

export function updateTargetOptions() {
    const categoryCount = Number(el('field-categoryCount').value);
    const select = el('field-targetCategoryIndex');
    const previous = Number(select.value) || 1;

    fillOptions(select, Array.from({ length: Math.max(0, categoryCount - 2) }, (_, index) => ({
        value: String(index + 1),
        label: `${index + 2}. Kategorie`,
    })));
    select.value = String(Math.min(previous, categoryCount - 2));
}

/**
 * Gives the seed field a value before anything can be generated with it.
 *
 * loadOptions fills it too, but only after awaiting the generator options - and
 * on a phone that await is long enough to open the settings and press generate.
 * An empty field used to become seed 0, which is both a degenerate booklet and
 * a nonsense entry in the results list.
 */
export function ensureSeed() {
    const field = el('field-seed');
    if (!field.value.trim()) field.value = randomSeed();
}

export async function loadOptions() {
    ensureSeed();
    const data = await fetchOptions();

    // A fresh seed each visit, so the first booklet is not the same one everyone
    // else gets. Typing a seed back in still reproduces a specific heft.
    el('field-seed').value = randomSeed();

    fillRange(el('field-categoryCount'), data.limits.categoryCount.min, data.limits.categoryCount.max, 5);
    fillRange(el('field-valuesPerCategory'), data.limits.valuesPerCategory.min, data.limits.valuesPerCategory.max, 5);
    updateTargetOptions();

    fillOptions(el('field-themeId'), data.themes.map(theme => ({ value: theme.id, label: theme.title })));

    // Play-time preferences are not booklet options: they are never sent to the
    // generator, and they outlive the puzzle chosen here.
    const prefs = loadPrefs();
    for (const key of ['autoCross', 'hideClock', 'hideDuel']) {
        const field = el(`field-${key}`);
        field.checked = prefs[key];
        // Re-read on every change: another switch may have been flipped since.
        field.addEventListener('change', () => savePrefs({ ...loadPrefs(), [key]: field.checked }));
    }

    setHint('config-hint', '');
}

/**
 * The options the generator is asked for.
 *
 * Title, subtitle and the three colours only ever reached the PDF, and the
 * booklet produced up to ten puzzles of which exactly one was ever played. They
 * are constants now rather than deletions, so the generator contract is
 * untouched and a later PDF path can set them again.
 */
export function collectOptions() {
    return {
        puzzleCount: 1,
        categoryCount: Number(el('field-categoryCount').value),
        valuesPerCategory: Number(el('field-valuesPerCategory').value),
        themeId: el('field-themeId').value,
        difficulty: el('field-difficulty').value,
        targetCategoryIndex: Number(el('field-targetCategoryIndex').value),
        // An empty field means "surprise me", not "seed zero": zero is a real
        // seed that every empty field would share.
        seed: Number(el('field-seed').value.trim() || randomSeed()),
        colors: { ...PALETTES.klassik },
    };
}

export function randomSeed() {
    return String(Math.floor(Math.random() * 100000));
}
