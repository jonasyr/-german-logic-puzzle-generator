import { generateGermanLogicBooklet } from '../src';

// The play grid ships as plain browser JavaScript; it exports itself for CommonJS too.
const PlayLogic = require('../webapp/playLogic.js') as {
    pairKey: (a: number, b: number, va: number, vb: number) => string;
    cellKey: (rowCat: number, rowVal: number, colCat: number, colVal: number) => string;
    buildTruthSet: (puzzle: unknown) => Set<string>;
    evaluate: (marks: Map<string, 'yes' | 'no'>, truth: Set<string>) =>
        { wrong: Set<string>; missing: number; solved: boolean };
};

describe('Play grid rules', () => {
    const puzzle = generateGermanLogicBooklet({
        puzzleCount: 1, categoryCount: 4, valuesPerCategory: 4, difficulty: 'leicht', seed: 77,
    }).puzzles[0];

    const categoryCount = puzzle.categories.length;
    const valueCount = puzzle.categories[0].values.length;
    const truth = PlayLogic.buildTruthSet(puzzle);
    const allTicked = () => new Map<string, 'yes' | 'no'>([...truth].map(key => [key, 'yes' as const]));

    test('addresses a cell identically from both axes', () => {
        expect(PlayLogic.cellKey(0, 2, 3, 1)).toBe(PlayLogic.pairKey(0, 3, 2, 1));
        expect(PlayLogic.cellKey(3, 1, 0, 2)).toBe(PlayLogic.pairKey(0, 3, 2, 1));
    });

    test('marks exactly one pair per category pair and participant', () => {
        const pairsPerRow = (categoryCount * (categoryCount - 1)) / 2;
        expect(truth.size).toBe(pairsPerRow * valueCount);
    });

    test('counts a fully ticked solution as solved', () => {
        const result = PlayLogic.evaluate(allTicked(), truth);

        expect(result.solved).toBe(true);
        expect(result.missing).toBe(0);
        expect(result.wrong.size).toBe(0);
    });

    test('reports a tick that contradicts the solution', () => {
        const marks = allTicked();
        const wrongKey = PlayLogic.cellKey(0, 0, 1, 0);
        const wasCorrect = truth.has(wrongKey);
        marks.set(wrongKey, wasCorrect ? 'no' : 'yes');

        const result = PlayLogic.evaluate(marks, truth);

        expect(result.solved).toBe(false);
        expect(result.wrong.has(wrongKey)).toBe(true);
        expect(result.wrong.size).toBe(1);
    });

    test('treats empty cells as missing rather than wrong', () => {
        const marks = allTicked();
        const [first, second] = [...truth];
        marks.delete(first);
        marks.delete(second);

        const result = PlayLogic.evaluate(marks, truth);

        expect(result.wrong.size).toBe(0);
        expect(result.missing).toBe(2);
        expect(result.solved).toBe(false);
    });

    test('accepts crosses on every pair that is not part of the solution', () => {
        const marks = allTicked();
        for (let a = 0; a < categoryCount; a++) {
            for (let b = a + 1; b < categoryCount; b++) {
                for (let va = 0; va < valueCount; va++) {
                    for (let vb = 0; vb < valueCount; vb++) {
                        const key = PlayLogic.pairKey(a, b, va, vb);
                        if (!truth.has(key)) marks.set(key, 'no');
                    }
                }
            }
        }

        const result = PlayLogic.evaluate(marks, truth);

        expect(result.wrong.size).toBe(0);
        expect(result.solved).toBe(true);
    });
});
