// logicals-site/test/daily-puzzle.test.ts
import { describe, expect, it } from 'vitest';
import {
  DAILY_CATEGORIES, DAILY_VALUES,
  berlinDate, dailyDifficulty, dailyOptions, dailySeed, dailyStreak, isDailyResult,
} from '../client/js/play/dailyPuzzle';

/** A solved result for a given date, at that date's daily seed unless told otherwise. */
function resultOn(date: string, overrides: Record<string, unknown> = {}) {
  return {
    seed: dailySeed(date),
    completedAt: `${date}T12:00:00.000Z`,
    configuration: { categoryCount: DAILY_CATEGORIES, valuesPerCategory: DAILY_VALUES },
    ...overrides,
  };
}

describe('which day it is', () => {
  it('reads the date in Berlin, not in the device timezone', () => {
    // 22:30 UTC on the 18th is already the 19th in Berlin (CEST, UTC+2).
    expect(berlinDate(new Date('2026-09-18T22:30:00Z'))).toBe('2026-09-19');
    // And 01:00 UTC is still the same German day it started.
    expect(berlinDate(new Date('2026-09-18T01:00:00Z'))).toBe('2026-09-18');
  });

  it('is stable across winter time too', () => {
    // January: CET, UTC+1.
    expect(berlinDate(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
    expect(berlinDate(new Date('2026-01-15T22:30:00Z'))).toBe('2026-01-15');
  });
});

describe('the daily seed', () => {
  it('is the same for everyone on the same German day', () => {
    expect(dailySeed('2026-09-18')).toBe(dailySeed('2026-09-18'));
  });

  it('differs from one day to the next', () => {
    const seeds = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']
      .map(dailySeed);
    expect(new Set(seeds).size).toBe(4);
  });

  it('is an integer the generator will accept', () => {
    const seed = dailySeed('2026-09-18');
    expect(Number.isSafeInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });
});

describe('the weekday rotation', () => {
  it('is gentle early in the week and hardest at the weekend', () => {
    // 2026-09-14 is a Monday.
    expect(dailyDifficulty('2026-09-14')).toBe('leicht');   // Mo
    expect(dailyDifficulty('2026-09-15')).toBe('leicht');   // Tu
    expect(dailyDifficulty('2026-09-16')).toBe('leicht');   // We
    expect(dailyDifficulty('2026-09-17')).toBe('mittel');   // Th
    expect(dailyDifficulty('2026-09-18')).toBe('mittel');   // Fr
    expect(dailyDifficulty('2026-09-19')).toBe('schwer');   // Sa
    expect(dailyDifficulty('2026-09-20')).toBe('schwer');   // Su
  });

  it('repeats weekly, so it is learnable', () => {
    expect(dailyDifficulty('2026-09-21')).toBe(dailyDifficulty('2026-09-14'));
  });
});

describe('the options it generates with', () => {
  it('fixes the shape so everyone\'s time means the same thing', () => {
    const options = dailyOptions('2026-09-18');
    expect(options.categoryCount).toBe(DAILY_CATEGORIES);
    expect(options.valuesPerCategory).toBe(DAILY_VALUES);
    expect(options.puzzleCount).toBe(1);
    expect(options.seed).toBe(dailySeed('2026-09-18'));
    expect(options.difficulty).toBe('mittel');
  });
});

describe('recognising a daily result', () => {
  it('matches a result played on its own day', () => {
    expect(isDailyResult(resultOn('2026-09-18'))).toBe(true);
  });

  it('rejects a custom puzzle that merely shares the seed number', () => {
    // Same seed, different shape: not the daily puzzle everyone else played.
    expect(isDailyResult(resultOn('2026-09-18', {
      configuration: { categoryCount: 4, valuesPerCategory: 5 },
    }))).toBe(false);
  });

  it('rejects yesterday\'s seed played today', () => {
    expect(isDailyResult(resultOn('2026-09-18', {
      seed: dailySeed('2026-09-17'),
    }))).toBe(false);
  });

  it('judges by the German day the result was completed on', () => {
    // 22:30 UTC on the 18th is the 19th in Berlin, so the 19th's seed is right.
    expect(isDailyResult({
      seed: dailySeed('2026-09-19'),
      completedAt: '2026-09-18T22:30:00.000Z',
      configuration: { categoryCount: 5, valuesPerCategory: 5 },
    })).toBe(true);
  });

  it('survives a row with no configuration', () => {
    expect(() => isDailyResult({
      seed: 1, completedAt: '2026-09-18T12:00:00.000Z',
    })).not.toThrow();
  });
});

describe('the streak', () => {
  it('counts consecutive days back from today', () => {
    const results = ['2026-09-18', '2026-09-17', '2026-09-16'].map(date => resultOn(date));
    expect(dailyStreak(results, '2026-09-18')).toBe(3);
  });

  it('is not broken by today being unplayed yet', () => {
    // Yesterday and the day before still count while today is open.
    const results = ['2026-09-17', '2026-09-16'].map(date => resultOn(date));
    expect(dailyStreak(results, '2026-09-18')).toBe(2);
  });

  it('is broken by a missed day', () => {
    const results = ['2026-09-18', '2026-09-16'].map(date => resultOn(date));
    expect(dailyStreak(results, '2026-09-18')).toBe(1);
  });

  it('counts a day once however often it was replayed', () => {
    const results = [resultOn('2026-09-18'), resultOn('2026-09-18')];
    expect(dailyStreak(results, '2026-09-18')).toBe(1);
  });

  it('ignores results that are not daily puzzles', () => {
    const results = [resultOn('2026-09-18', { seed: 12345 })];
    expect(dailyStreak(results, '2026-09-18')).toBe(0);
  });

  it('is zero with no history at all', () => {
    expect(dailyStreak([], '2026-09-18')).toBe(0);
  });
});
