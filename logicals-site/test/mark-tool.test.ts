import { describe, expect, it } from 'vitest';
import { nextMark } from '../client/js/play/markTool';

describe('what a tap writes', () => {
  it('writes the armed tool onto an empty cell', () => {
    expect(nextMark(undefined, 'no')).toBe('no');
    expect(nextMark(undefined, 'yes')).toBe('yes');
    expect(nextMark(undefined, 'maybe')).toBe('maybe');
  });

  it('clears when the armed tool is already what the cell holds', () => {
    // Every tool is a switch, so correcting costs one tap and never produces a
    // surprise third state.
    expect(nextMark('no', 'no')).toBeNull();
    expect(nextMark('yes', 'yes')).toBeNull();
    expect(nextMark('maybe', 'maybe')).toBeNull();
  });

  it('overwrites a different mark rather than clearing it', () => {
    expect(nextMark('no', 'yes')).toBe('yes');
    expect(nextMark('maybe', 'no')).toBe('no');
    expect(nextMark('yes', 'maybe')).toBe('maybe');
  });

  it('erases with the eraser, and does nothing to an empty cell', () => {
    expect(nextMark('yes', 'clear')).toBeNull();
    expect(nextMark(undefined, 'clear')).toBeNull();
  });

  it('writes nothing at all when no tool is armed', () => {
    // `undefined` is "leave the cell exactly as it is", which is how an unarmed
    // tool inspects without changing anything.
    expect(nextMark(undefined, null)).toBe(undefined);
    expect(nextMark('no', null)).toBe(undefined);
  });
});
