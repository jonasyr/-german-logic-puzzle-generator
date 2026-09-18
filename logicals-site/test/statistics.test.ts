import { describe, expect, it } from 'vitest';
import { headToHead, median, personalStats } from '../client/js/stats/statistics';

const solo = (difficulty: string, elapsedMs: number, failedChecks: number, completedAt: string) => ({
  roomId: null, difficulty, elapsedMs, failedChecks, completedAt, seed: 1,
  configuration: { categoryCount: 5, valuesPerCategory: 5 },
  opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
});

const duel = (opponent: string, mine: number, theirs: number, difficulty = 'mittel') => ({
  roomId: 1, difficulty, elapsedMs: mine, failedChecks: 0,
  completedAt: '2026-09-18T12:00:00.000Z', seed: 1,
  configuration: { categoryCount: 5, valuesPerCategory: 5 },
  opponentName: opponent, opponentElapsedMs: theirs, opponentFailedChecks: 0,
});

describe('median', () => {
  it('takes the middle of an odd count', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middles of an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('is null with nothing to average', () => {
    expect(median([])).toBeNull();
  });

  it('is not dragged by one abandoned evening, unlike a mean', () => {
    const times = [300, 320, 310, 330, 20_000];
    expect(median(times)).toBe(320);
    // The mean would be over 4000 - which describes nobody's experience.
    expect(median(times)).toBeLessThan(1000);
  });
});

describe('personal statistics', () => {
  const results = [
    solo('leicht', 240_000, 0, '2026-09-18T12:00:00.000Z'),
    solo('leicht', 260_000, 2, '2026-09-17T12:00:00.000Z'),
    solo('mittel', 520_000, 3, '2026-09-16T12:00:00.000Z'),
    solo('schwer', 900_000, 5, '2026-09-15T12:00:00.000Z'),
  ];

  it('counts and medians per difficulty', () => {
    const stats = personalStats(results, '2026-09-18');
    const leicht = stats.byDifficulty.find(entry => entry.difficulty === 'leicht')!;
    expect(leicht.solved).toBe(2);
    expect(leicht.medianMs).toBe(250_000);
  });

  it('orders difficulties the way the settings screen does', () => {
    const stats = personalStats(results, '2026-09-18');
    expect(stats.byDifficulty.map(entry => entry.difficulty)).toEqual(['leicht', 'mittel', 'schwer']);
  });

  it('omits a difficulty that has never been played', () => {
    const stats = personalStats([solo('mittel', 1000, 0, '2026-09-18T12:00:00.000Z')], '2026-09-18');
    expect(stats.byDifficulty.map(entry => entry.difficulty)).toEqual(['mittel']);
  });

  it('compares the older half of the history against the newer', () => {
    const stats = personalStats(results, '2026-09-18');
    // Newest first, so the later half is the two most recent.
    expect(stats.failedChecksTrend).toEqual({ later: 1, earlier: 4 });
  });

  it('has no trend to report from a single result', () => {
    const stats = personalStats([results[0]], '2026-09-18');
    expect(stats.failedChecksTrend).toBeNull();
  });

  it('reports the totals worth keeping', () => {
    const stats = personalStats(results, '2026-09-18');
    expect(stats.total).toBe(4);
    expect(stats.totalMs).toBe(1_920_000);
    expect(stats.best?.elapsedMs).toBe(240_000);
    expect(stats.longest?.elapsedMs).toBe(900_000);
  });

  it('survives an empty history without pretending', () => {
    const stats = personalStats([], '2026-09-18');
    expect(stats.total).toBe(0);
    expect(stats.byDifficulty).toEqual([]);
    expect(stats.best).toBeNull();
    expect(stats.failedChecksTrend).toBeNull();
    expect(stats.streak).toBe(0);
  });
});

describe('head to head', () => {
  it('records wins, losses and draws per opponent', () => {
    const stats = headToHead([
      duel('Bo', 60_000, 75_000),
      duel('Bo', 80_000, 70_000),
      duel('Bo', 50_000, 50_000),
      duel('Lea', 90_000, 60_000),
    ]);
    const bo = stats.find(entry => entry.opponent === 'Bo')!;
    expect([bo.won, bo.lost, bo.drawn]).toEqual([1, 1, 1]);
    const lea = stats.find(entry => entry.opponent === 'Lea')!;
    expect([lea.won, lea.lost, lea.drawn]).toEqual([0, 1, 0]);
  });

  it('signs the average margin so ahead and behind read differently', () => {
    const [bo] = headToHead([duel('Bo', 60_000, 75_000), duel('Bo', 70_000, 75_000)]);
    // 15s and 5s ahead: positive means faster.
    expect(bo.averageMarginMs).toBe(10_000);

    const [lea] = headToHead([duel('Lea', 90_000, 60_000)]);
    expect(lea.averageMarginMs).toBe(-30_000);
  });

  it('says which difficulty each side is faster at', () => {
    const [bo] = headToHead([
      duel('Bo', 40_000, 60_000, 'leicht'),
      duel('Bo', 90_000, 60_000, 'schwer'),
    ]);
    expect(bo.fasterAt).toEqual({ leicht: 'me', schwer: 'them' });
  });

  it('keeps the last five as a strip, newest first', () => {
    const many = Array.from({ length: 7 }, (_, index) => duel('Bo', index * 1000, 3500));
    const [bo] = headToHead(many);
    expect(bo.recent).toHaveLength(5);
    expect(bo.recent[0]).toBe('won');      // 0ms beats 3500ms
  });

  it('ignores duels the opponent has not finished', () => {
    const unfinished = { ...duel('Bo', 60_000, 0), opponentName: null, opponentElapsedMs: null };
    expect(headToHead([unfinished])).toEqual([]);
  });

  it('ignores solo results entirely', () => {
    expect(headToHead([solo('leicht', 1000, 0, '2026-09-18T12:00:00.000Z')])).toEqual([]);
  });
});

/*
 * The module orders the rows itself.
 *
 * The endpoint happens to serve them newest first, but a statistic that silently
 * inverts when a caller sorts differently is a trap: "improving" and "getting
 * worse" would swap without anything failing.
 */
describe('ordering is not the caller\'s job', () => {
  const dated = (completedAt: string, failedChecks: number) => ({
    roomId: null, difficulty: 'leicht', elapsedMs: 1000, failedChecks, completedAt,
    seed: 1, configuration: { categoryCount: 5, valuesPerCategory: 5 },
    opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
  });

  it('reports the same trend whichever way the rows arrive', () => {
    // Four early mistakes, none lately: improvement, in either order.
    const newestFirst = [
      dated('2026-09-18T12:00:00.000Z', 0), dated('2026-09-17T12:00:00.000Z', 0),
      dated('2026-09-16T12:00:00.000Z', 4), dated('2026-09-15T12:00:00.000Z', 4),
    ];
    const oldestFirst = [...newestFirst].reverse();

    const a = personalStats(newestFirst, '2026-09-18').failedChecksTrend;
    const b = personalStats(oldestFirst, '2026-09-18').failedChecksTrend;
    expect(a).toEqual({ later: 0, earlier: 4 });
    expect(b).toEqual(a);
  });

  it('takes the genuinely most recent five duels for the strip', () => {
    const duelOn = (completedAt: string, mine: number) => ({
      roomId: 1, difficulty: 'mittel', elapsedMs: mine, failedChecks: 0, completedAt,
      seed: 1, configuration: { categoryCount: 5, valuesPerCategory: 5 },
      opponentName: 'Bo', opponentElapsedMs: 50_000, opponentFailedChecks: 0,
    });
    // Oldest first, and only the newest six are wins.
    const rows = [
      duelOn('2026-09-10T12:00:00.000Z', 90_000),   // a loss, and the oldest
      duelOn('2026-09-11T12:00:00.000Z', 10_000),
      duelOn('2026-09-12T12:00:00.000Z', 10_000),
      duelOn('2026-09-13T12:00:00.000Z', 10_000),
      duelOn('2026-09-14T12:00:00.000Z', 10_000),
      duelOn('2026-09-15T12:00:00.000Z', 10_000),
    ];
    const [bo] = headToHead(rows);
    expect(bo.recent).toEqual(['won', 'won', 'won', 'won', 'won']);
  });
});
