import { describe, expect, it, vi } from 'vitest';
import { generateGermanLogicBooklet } from 'logic-puzzle-generator';
import {
  canonicalPuzzle,
  fingerprintPuzzle,
} from '../client/js/generation/canonicalPuzzle';

describe('runtime generation', () => {
  it('ignores unrelated metadata while fingerprinting puzzle truth', async () => {
    const puzzle = generateGermanLogicBooklet({
      puzzleCount: 1,
      categoryCount: 3,
      valuesPerCategory: 4,
      difficulty: 'leicht',
      seed: 77,
    }).puzzles[0];
    const clone = JSON.parse(JSON.stringify(puzzle));
    clone.generatedAt = '2099-01-01';

    expect(canonicalPuzzle(clone)).toBe(canonicalPuzzle(puzzle));
    expect(await fingerprintPuzzle(clone)).toBe(await fingerprintPuzzle(puzzle));
  });

  it('keeps the used booklet path independent from the wall clock', () => {
    const options = {
      puzzleCount: 1,
      categoryCount: 3,
      valuesPerCategory: 4,
      difficulty: 'leicht' as const,
      seed: 91,
    };
    vi.spyOn(Date, 'now').mockReturnValue(1);
    const first = generateGermanLogicBooklet(options);
    vi.spyOn(Date, 'now').mockReturnValue(9_999_999);
    const second = generateGermanLogicBooklet(options);

    expect(second).toEqual(first);
    vi.restoreAllMocks();
  });
});
