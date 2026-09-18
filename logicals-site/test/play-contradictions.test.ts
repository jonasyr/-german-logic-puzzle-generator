import { describe, expect, it } from 'vitest';
import { generateGermanLogicBooklet } from 'logic-puzzle-generator';
import PlayLogic from '../client/playLogic.js';

const { findContradictions, buildTruthSet, cellKey } = PlayLogic as any;

const V = 5;
const C = 5;
const marksOf = (entries: Array<[string, string]>) => new Map(entries);

describe('contradictions in the player\'s own marks', () => {
  it('finds nothing in an empty grid', () => {
    expect([...findContradictions(marksOf([]), C, V)]).toEqual([]);
  });

  it('finds nothing in a consistent block', () => {
    const marks = marksOf([
      ['0.1.0.0', 'yes'], ['0.1.0.1', 'no'], ['0.1.1.0', 'no'],
    ]);
    expect([...findContradictions(marks, C, V)]).toEqual([]);
  });

  it('flags two confirmations in one row', () => {
    const marks = marksOf([['0.1.2.1', 'yes'], ['0.1.2.3', 'yes']]);
    expect([...findContradictions(marks, C, V)].sort()).toEqual(['0.1.2.1', '0.1.2.3']);
  });

  it('flags two confirmations in one column', () => {
    const marks = marksOf([['0.1.1.4', 'yes'], ['0.1.3.4', 'yes']]);
    expect([...findContradictions(marks, C, V)].sort()).toEqual(['0.1.1.4', '0.1.3.4']);
  });

  it('flags a row with nothing left to assign', () => {
    const marks = marksOf(
      Array.from({ length: V }, (_, column) => [`0.1.2.${column}`, 'no'] as [string, string]),
    );
    const found = [...findContradictions(marks, C, V)];
    expect(found).toHaveLength(V);
    expect(found.every(key => key.startsWith('0.1.2.'))).toBe(true);
  });

  it('flags a column with nothing left to assign', () => {
    const marks = marksOf(
      Array.from({ length: V }, (_, row) => [`0.1.${row}.2`, 'no'] as [string, string]),
    );
    expect([...findContradictions(marks, C, V)]).toHaveLength(V);
  });

  it('flags a transitive impossibility across blocks', () => {
    // A=B and A=C are confirmed, so B=C must hold - but it is crossed out.
    const marks = marksOf([
      ['0.1.0.0', 'yes'],   // A0 = B0
      ['0.2.0.0', 'yes'],   // A0 = C0
      ['1.2.0.0', 'no'],    // B0 != C0  <- impossible
    ]);
    expect([...findContradictions(marks, C, V)].sort()).toEqual(['0.1.0.0', '0.2.0.0', '1.2.0.0']);
  });

  it('ignores notes entirely', () => {
    // A note is uncertainty, not a claim, so it cannot contradict anything.
    const marks = marksOf([['0.1.2.1', 'maybe'], ['0.1.2.3', 'maybe']]);
    expect([...findContradictions(marks, C, V)]).toEqual([]);
  });

  it('never reports a cell that carries no mark', () => {
    const marks = marksOf([['0.1.2.1', 'yes'], ['0.1.2.3', 'yes']]);
    for (const key of findContradictions(marks, C, V)) {
      expect(marks.has(key)).toBe(true);
    }
  });

  it('is symmetric: order of marking cannot change the verdict', () => {
    const entries: Array<[string, string]> = [
      ['0.1.2.1', 'yes'], ['0.1.2.3', 'yes'], ['0.2.0.0', 'yes'],
    ];
    const forward = [...findContradictions(marksOf(entries), C, V)].sort();
    const backward = [...findContradictions(marksOf([...entries].reverse()), C, V)].sort();
    expect(backward).toEqual(forward);
  });
});

/*
 * The property that matters most: a correctly solved grid must be silent.
 *
 * Hand-written cases prove the rules fire. Only a real puzzle proves they do not
 * fire when they should not - a false positive here would accuse the player of
 * contradicting themselves while they are playing perfectly, which is far worse
 * than missing a contradiction.
 */
describe('against real generated puzzles', () => {
  const booklet = generateGermanLogicBooklet({
    puzzleCount: 3,
    categoryCount: 5,
    valuesPerCategory: 5,
    difficulty: 'mittel',
    seed: 4711,
    generatedAt: '2026-09-18',
  }) as any;

  /** Every mark a perfect solver would end up with: the truth, plus its crosses. */
  function solvedMarks(puzzle: any) {
    const truth = buildTruthSet(puzzle);
    const marks = new Map<string, string>();
    for (const key of truth) marks.set(key, 'yes');
    const categories = puzzle.categories.length;
    const values = puzzle.categories[0].values.length;
    for (let a = 0; a < categories; a++) {
      for (let b = a + 1; b < categories; b++) {
        for (let va = 0; va < values; va++) {
          for (let vb = 0; vb < values; vb++) {
            const key = cellKey(a, va, b, vb);
            if (!marks.has(key)) marks.set(key, 'no');
          }
        }
      }
    }
    return marks;
  }

  it('generated three puzzles to test against', () => {
    expect(booklet.puzzles).toHaveLength(3);
  });

  it('is silent on a fully and correctly solved grid', () => {
    for (const puzzle of booklet.puzzles) {
      const found = findContradictions(solvedMarks(puzzle), puzzle.categories.length, 5);
      expect([...found], puzzle.title).toEqual([]);
    }
  });

  it('is silent on every partial prefix of a correct solution', () => {
    // Playing correctly must never be accused, at any point along the way.
    for (const puzzle of booklet.puzzles) {
      const complete = [...solvedMarks(puzzle)];
      for (let size = 0; size <= complete.length; size += 17) {
        const partial = new Map(complete.slice(0, size));
        const found = findContradictions(partial, puzzle.categories.length, 5);
        expect([...found], `${puzzle.title} @ ${size}`).toEqual([]);
      }
    }
  });

  it('catches every single-cell corruption of a solved grid', () => {
    // Flipping one confirmation to a cross, or one cross to a confirmation,
    // always breaks something a rule can see.
    for (const puzzle of booklet.puzzles) {
      const solved = solvedMarks(puzzle);
      let checked = 0;
      for (const [key, mark] of solved) {
        const corrupted = new Map(solved);
        corrupted.set(key, mark === 'yes' ? 'no' : 'yes');
        const found = findContradictions(corrupted, puzzle.categories.length, 5);
        expect(found.size, `${puzzle.title} flipping ${key}`).toBeGreaterThan(0);
        expect(found.has(key), `${puzzle.title} flipping ${key}`).toBe(true);
        checked++;
        if (checked >= 40) break;   // 40 per puzzle is plenty, and keeps this fast
      }
      expect(checked).toBeGreaterThan(0);
    }
  });

  it('never reports an unmarked cell, whatever the marks are', () => {
    for (const puzzle of booklet.puzzles) {
      const solved = solvedMarks(puzzle);
      const corrupted = new Map(solved);
      // Introduce several contradictions at once.
      let flipped = 0;
      for (const [key, mark] of solved) {
        if (mark !== 'yes') continue;
        corrupted.set(key, 'no');
        if (++flipped >= 5) break;
      }
      for (const key of findContradictions(corrupted, puzzle.categories.length, 5)) {
        expect(corrupted.has(key), key).toBe(true);
      }
    }
  });

  it('handles the smallest supported puzzle shape', () => {
    const small = generateGermanLogicBooklet({
      puzzleCount: 1, categoryCount: 3, valuesPerCategory: 4,
      difficulty: 'leicht', seed: 99, generatedAt: '2026-09-18',
    }) as any;
    const puzzle = small.puzzles[0];
    const truth = buildTruthSet(puzzle);
    const marks = new Map<string, string>();
    for (const key of truth) marks.set(key, 'yes');
    expect([...findContradictions(marks, 3, 4)]).toEqual([]);
  });
});
