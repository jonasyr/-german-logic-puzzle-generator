import { describe, expect, it } from 'vitest';
import {
  createPlayState, recordFailedCheck, resetForNewAttempt, storageKeyFor,
} from '../client/js/play/playState';

describe('failed check accounting', () => {
  it('increments once per unsuccessful check action, not per wrong cell', () => {
    const state = createPlayState();
    recordFailedCheck(state, 3);
    recordFailedCheck(state, 1);
    recordFailedCheck(state, 0);
    expect(state.failedChecks).toBe(2);
  });
});

describe('play-state isolation', () => {
  it('separates players, solo games, and duel rooms', () => {
    const puzzle = { id: 'museum', seed: 4, clues: ['A'], categories: [{ values: [1] }] };
    const soloJonas = storageKeyFor(puzzle, { mode: 'solo', player: { id: 1 } });
    const soloLea = storageKeyFor(puzzle, { mode: 'solo', player: { id: 2 } });
    const duelJonas = storageKeyFor(puzzle, { mode: 'duel', player: { id: 1 }, room: { id: 9 } });
    expect(new Set([soloJonas, soloLea, duelJonas])).toHaveLength(3);
  });

  it('starts a fresh score after reopening a solved puzzle', () => {
    const state = createPlayState();
    state.solved = true;
    (state as any).attemptKey = 'old';
    state.resultQueued = true;
    state.failedChecks = 3;
    state.marks.set('a', 'yes');
    resetForNewAttempt(state);
    expect(state).toEqual(expect.objectContaining({
      solved: false, attemptKey: null, resultQueued: false, failedChecks: 0,
    }));
    expect(state.marks.size).toBe(0);
  });
});
