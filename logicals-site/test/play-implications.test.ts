import { describe, expect, it } from 'vitest';
import {
  createPlayState, impliedKeys, setMarkWith, undoMark, clearMarks, save, load,
} from '../client/js/play/playState';

const V = 5;

function fresh(): any {
  return createPlayState();
}

/** Marks, as a plain object, for readable assertions. */
const snapshot = (state: any) => Object.fromEntries(state.marks);

describe('trivial implications of a confirmed cell', () => {
  it('names the rest of the row and column inside the same block', () => {
    const implied = impliedKeys('0.1.2.3', V).sort();
    expect(implied).toEqual([
      '0.1.0.3', '0.1.1.3', '0.1.2.0', '0.1.2.1',
      '0.1.2.2', '0.1.2.4', '0.1.3.3', '0.1.4.3',
    ].sort());
    // Two arms of four, and never the cell itself.
    expect(implied).toHaveLength(2 * (V - 1));
    expect(implied).not.toContain('0.1.2.3');
  });

  it('stays inside its own block', () => {
    for (const key of impliedKeys('1.3.0.0', V)) {
      expect(key.startsWith('1.3.')).toBe(true);
    }
  });

  it('handles the smallest supported block', () => {
    expect(impliedKeys('0.1.0.0', 4)).toHaveLength(2 * 3);
  });
});

describe('setting and clearing a confirmed cell', () => {
  it('fills the trivial crosses when a cell is confirmed', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'yes', V);
    expect(state.marks.get('0.1.2.3')).toBe('yes');
    for (const key of impliedKeys('0.1.2.3', V)) {
      expect(state.marks.get(key)).toBe('no');
    }
    expect(state.marks.size).toBe(1 + 2 * (V - 1));
  });

  it('removes those crosses again when the confirmation is taken back', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'yes', V);
    setMarkWith(state, '0.1.2.3', null, V);
    expect(snapshot(state)).toEqual({});
  });

  it('keeps a cross the player placed themselves', () => {
    const state = fresh();
    // The player crosses this one out by hand first.
    setMarkWith(state, '0.1.2.0', 'no', V);
    setMarkWith(state, '0.1.2.3', 'yes', V);
    setMarkWith(state, '0.1.2.3', null, V);
    // Their own cross survives; only the derived ones are withdrawn.
    expect(snapshot(state)).toEqual({ '0.1.2.0': 'no' });
  });

  it('keeps a cross that a second confirmation still justifies', () => {
    const state = fresh();
    // Two confirmations in the same block both imply 0.1.2.1 is excluded:
    // one shares its row, the other its column.
    setMarkWith(state, '0.1.2.3', 'yes', V);
    setMarkWith(state, '0.1.0.1', 'yes', V);
    expect(state.marks.get('0.1.2.1')).toBe('no');
    setMarkWith(state, '0.1.2.3', null, V);
    expect(state.marks.get('0.1.2.1')).toBe('no');
    setMarkWith(state, '0.1.0.1', null, V);
    expect(state.marks.get('0.1.2.1')).toBeUndefined();
  });

  it('hands a derived cross over to the player once they edit it themselves', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'yes', V);        // 0.1.2.0 becomes a derived cross
    expect(state.marks.get('0.1.2.0')).toBe('no');

    // The player clears it, then decides it really is excluded and re-draws it.
    setMarkWith(state, '0.1.2.0', null, V);
    setMarkWith(state, '0.1.2.0', 'no', V);

    // It is theirs now, so withdrawing the confirmation must leave it alone.
    setMarkWith(state, '0.1.2.3', null, V);
    expect(state.marks.get('0.1.2.0')).toBe('no');
  });

  it('never overwrites another confirmation', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.1', 'yes', V);
    const before = state.marks.get('0.1.2.1');
    setMarkWith(state, '0.1.2.3', 'yes', V);
    expect(state.marks.get('0.1.2.1')).toBe(before);
  });
});

describe('the automatic-crosses preference', () => {
  it('places no crosses when it is off', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'yes', V, false);
    expect(snapshot(state)).toEqual({ '0.1.2.3': 'yes' });
  });

  it('still withdraws crosses derived while it was on', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'yes', V, true);   // derived while on
    setMarkWith(state, '0.1.2.3', null, V, false);   // player turns it off, then undoes
    // Leaving them behind would strand crosses that nothing explains any more.
    expect(snapshot(state)).toEqual({});
  });
});

describe('undo treats one tap as one step', () => {
  it('takes back the confirmation and all of its crosses together', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'yes', V);
    const affected = undoMark(state);
    expect(affected).toHaveLength(1 + 2 * (V - 1));
    expect(snapshot(state)).toEqual({});
    expect(state.undo).toHaveLength(0);
  });

  it('restores the crosses when an undone removal is taken back', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'yes', V);
    setMarkWith(state, '0.1.2.3', null, V);
    expect(snapshot(state)).toEqual({});
    undoMark(state);
    expect(state.marks.get('0.1.2.3')).toBe('yes');
    for (const key of impliedKeys('0.1.2.3', V)) {
      expect(state.marks.get(key)).toBe('no');
    }
  });

  it('restores provenance, so a later removal still cleans up', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'yes', V);
    setMarkWith(state, '0.1.2.3', null, V);
    undoMark(state);                       // the confirmation is back
    setMarkWith(state, '0.1.2.3', null, V); // and removing it must still tidy up
    expect(snapshot(state)).toEqual({});
  });

  it('reports no change when there is nothing to undo', () => {
    expect(undoMark(fresh())).toEqual([]);
  });

  it('is a no-op when the mark is already what is asked for', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'no', V);
    const undoDepth = state.undo.length;
    expect(setMarkWith(state, '0.1.2.3', 'no', V)).toEqual([]);
    expect(state.undo).toHaveLength(undoDepth);
  });
});

describe('persistence of derived marks', () => {
  it('survives a save and load, provenance included', () => {
    const store = new Map<string, string>();
    (globalThis as any).localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, v); },
    };

    const state = fresh();
    state.storageKey = 'test:key';
    setMarkWith(state, '0.1.2.3', 'yes', V);
    save(state, 1234);

    const restored: any = createPlayState();
    restored.storageKey = 'test:key';
    expect(load(restored)).toBe(1234);
    expect(restored.marks.get('0.1.2.3')).toBe('yes');

    // Provenance came back, so taking the confirmation off still withdraws them.
    setMarkWith(restored, '0.1.2.3', null, V);
    expect(Object.fromEntries(restored.marks)).toEqual({});
  });
});

describe('clearing', () => {
  it('drops derived marks and their provenance', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'yes', V);
    clearMarks(state);
    expect(state.marks.size).toBe(0);
    expect(state.auto.size).toBe(0);
    expect(state.undo).toHaveLength(0);
  });
});
