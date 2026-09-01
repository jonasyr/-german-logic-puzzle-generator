import {
    BOOKLET_LIMITS,
    DEFAULT_BOOKLET_COLORS,
    generateGermanLogicBooklet,
    listGermanThemes,
} from '../src';

describe('German booklet configuration', () => {
    test('keeps the original ten-puzzle booklet when called without options', () => {
        const booklet = generateGermanLogicBooklet();

        expect(booklet.puzzles).toHaveLength(10);
        expect(booklet.puzzles.map(puzzle => puzzle.seed)).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
        expect(booklet.title).toBe('Logik unter Hochdruck');
        expect(booklet.subtitle).toBe('10 schwere deutsche Logicals mit vollständigen Lösungen');
        expect(booklet.colors).toEqual(DEFAULT_BOOKLET_COLORS);
        expect(booklet.config.categoryCount).toBe(5);
    }, 60_000);

    test('honours puzzle count, category count and values per category', () => {
        const booklet = generateGermanLogicBooklet({
            puzzleCount: 2,
            categoryCount: 3,
            valuesPerCategory: 4,
            difficulty: 'leicht',
        });

        expect(booklet.puzzles).toHaveLength(2);
        for (const puzzle of booklet.puzzles) {
            expect(puzzle.categories).toHaveLength(3);
            expect(puzzle.categories.every(category => category.values.length === 4)).toBe(true);
            expect(puzzle.solutionRows).toHaveLength(4);
            expect(puzzle.verification.fullGridSolved).toBe(true);
            expect(puzzle.clues.length).toBeGreaterThan(0);
        }
    }, 60_000);

    test('clamps out-of-range values instead of throwing', () => {
        const booklet = generateGermanLogicBooklet({ puzzleCount: 99, categoryCount: 1, valuesPerCategory: 42 });

        expect(booklet.config.puzzleCount).toBe(BOOKLET_LIMITS.puzzleCount.max);
        expect(booklet.config.categoryCount).toBe(BOOKLET_LIMITS.categoryCount.min);
        expect(booklet.config.valuesPerCategory).toBe(BOOKLET_LIMITS.valuesPerCategory.max);
    }, 120_000);

    test('uses a single theme when one is selected and falls back for unknown ids', () => {
        const single = generateGermanLogicBooklet({ puzzleCount: 2, themeId: 'museum', categoryCount: 3, difficulty: 'leicht' });
        expect(single.puzzles.map(puzzle => puzzle.id)).toEqual(['museum', 'museum']);
        expect(single.puzzles[0].seed).not.toBe(single.puzzles[1].seed);

        const fallback = generateGermanLogicBooklet({ puzzleCount: 1, themeId: 'gibt-es-nicht', categoryCount: 3, difficulty: 'leicht' });
        expect(fallback.config.themeId).toBe('standard');
    }, 60_000);

    test('targets the requested category with the final question', () => {
        const booklet = generateGermanLogicBooklet({
            puzzleCount: 1, categoryCount: 5, difficulty: 'leicht', targetCategoryIndex: 3, themeId: 'museum',
        });

        expect(booklet.puzzles[0].targetQuestion).toContain('Ticketfarbe');
    }, 60_000);

    test('is reproducible for identical options and reacts to the seed', () => {
        const options = { puzzleCount: 1, categoryCount: 4, difficulty: 'mittel' as const, seed: 4242 };
        const first = generateGermanLogicBooklet(options);
        const second = generateGermanLogicBooklet(options);
        const other = generateGermanLogicBooklet({ ...options, seed: 4243 });

        expect(second.puzzles).toEqual(first.puzzles);
        expect(other.puzzles[0].clues).not.toEqual(first.puzzles[0].clues);
    }, 90_000);

    test('accepts valid hex colors and ignores invalid ones', () => {
        const booklet = generateGermanLogicBooklet({
            puzzleCount: 1, categoryCount: 3, difficulty: 'leicht',
            colors: { accent: '#7c3aed', secondary: 'rgb(1,2,3)' },
        });

        expect(booklet.colors.accent).toBe('#7C3AED');
        expect(booklet.colors.secondary).toBe(DEFAULT_BOOKLET_COLORS.secondary);
    }, 60_000);

    test('lists all built-in themes for a theme picker', () => {
        const themes = listGermanThemes();

        expect(themes).toHaveLength(10);
        expect(themes[0]).toMatchObject({ id: 'streetfood' });
        expect(themes[0].categories).toHaveLength(5);
    });
});
