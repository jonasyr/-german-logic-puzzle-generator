/** Settings screen: option loading, palette presets and the generate request. */

import { el, setHint, fillRange, fillOptions } from '../dom.js';
import { fetchOptions } from '../api.js';
import { loadPrefs, savePrefs } from '../play/playPrefs.js';

export const PALETTES = {
    klassik: { label: 'Klassik', accent: '#C6492D', secondary: '#227C78', ink: '#172033' },
    nacht: { label: 'Nacht', accent: '#7C3AED', secondary: '#0F766E', ink: '#111827' },
    wald: { label: 'Wald', accent: '#2F6B3C', secondary: '#8A5A21', ink: '#1B2A20' },
    beere: { label: 'Beere', accent: '#B0245B', secondary: '#3C5CA8', ink: '#231428' },
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

export async function loadOptions(state) {
    ensureSeed();
    const data = await fetchOptions();
    state.limits = data.limits;
    state.pdfAvailable = data.pdfAvailable;

    // A fresh seed each visit, so the first booklet is not the same one everyone
    // else gets. Typing a seed back in still reproduces a specific heft.
    el('field-seed').value = randomSeed();

    fillRange(el('field-puzzleCount'), data.limits.puzzleCount.min, data.limits.puzzleCount.max, 5);
    fillRange(el('field-categoryCount'), data.limits.categoryCount.min, data.limits.categoryCount.max, 5);
    fillRange(el('field-valuesPerCategory'), data.limits.valuesPerCategory.min, data.limits.valuesPerCategory.max, 5);
    updateTargetOptions();

    fillOptions(el('field-themeId'), data.themes.map(theme => ({ value: theme.id, label: theme.title })));
    fillOptions(el('field-palette'), Object.entries(PALETTES).map(([value, palette]) => ({
        value, label: palette.label,
    })));

    // Play-time preferences are not booklet options: they are never sent to the
    // generator, and they outlive the puzzle chosen here.
    const autoCross = el('field-autoCross');
    autoCross.checked = loadPrefs().autoCross;
    autoCross.addEventListener('change', () => savePrefs({ autoCross: autoCross.checked }));

    setHint('config-hint', '');
}

export function collectOptions() {
    const title = el('field-title').value.trim();
    const subtitle = el('field-subtitle').value.trim();
    return {
        puzzleCount: Number(el('field-puzzleCount').value),
        categoryCount: Number(el('field-categoryCount').value),
        valuesPerCategory: Number(el('field-valuesPerCategory').value),
        themeId: el('field-themeId').value,
        difficulty: el('field-difficulty').value,
        targetCategoryIndex: Number(el('field-targetCategoryIndex').value),
        // An empty field means "surprise me", not "seed zero": zero is a real
        // seed that every empty field would share.
        seed: Number(el('field-seed').value.trim() || randomSeed()),
        ...(title ? { title } : {}),
        ...(subtitle ? { subtitle } : {}),
        colors: {
            accent: el('field-accent').value,
            secondary: el('field-secondary').value,
            ink: el('field-ink').value,
        },
    };
}

export function randomSeed() {
    return String(Math.floor(Math.random() * 100000));
}

export function applyPalette(key) {
    const palette = PALETTES[key];
    if (!palette) return;
    el('field-accent').value = palette.accent;
    el('field-secondary').value = palette.secondary;
    el('field-ink').value = palette.ink;
}
