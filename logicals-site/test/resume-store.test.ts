import { beforeEach, describe, expect, it } from 'vitest';
import { clearResume, loadResume, saveResume } from '../client/js/play/resumeStore';

const RECORD = {
  options: { seed: 7, categoryCount: 5, valuesPerCategory: 5 },
  puzzleIndex: 2,
  fingerprint: 'abc123',
  storageKey: 'logicals:play:solo:none:1:p:7:5x5:zz',
  playerId: 1,
  title: 'Finale beim Street-Food-Festival',
  savedAt: '2026-09-18T00:00:00.000Z',
  elapsedMs: 61_000,
  markCount: 12,
};

function useStorage(store = new Map<string, string>()) {
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  return store;
}

describe('the resume record', () => {
  beforeEach(() => { useStorage(); });

  it('round-trips everything needed to rebuild the game', () => {
    saveResume(RECORD);
    expect(loadResume(1)).toEqual(RECORD);
  });

  it('keeps only the most recent game', () => {
    saveResume(RECORD);
    saveResume({ ...RECORD, puzzleIndex: 5, markCount: 40 });
    expect(loadResume(1)?.puzzleIndex).toBe(5);
  });

  it('does not hand one player another player\'s game', () => {
    // Resuming it would file the result under the wrong name.
    saveResume(RECORD);
    expect(loadResume(2)).toBeNull();
  });

  it('clears on request', () => {
    saveResume(RECORD);
    clearResume();
    expect(loadResume(1)).toBeNull();
  });

  it('returns null rather than throwing on a corrupt record', () => {
    const store = useStorage();
    store.set('logicals.resume.v1', '{not json');
    expect(loadResume(1)).toBeNull();
  });

  it('rejects a record missing anything it needs to regenerate', () => {
    const store = useStorage();
    const { fingerprint, ...incomplete } = RECORD;
    store.set('logicals.resume.v1', JSON.stringify(incomplete));
    expect(loadResume(1)).toBeNull();
  });

  it('survives storage being unavailable', () => {
    (globalThis as any).localStorage = {
      getItem() { throw new Error('private mode'); },
      setItem() { throw new Error('private mode'); },
      removeItem() { throw new Error('private mode'); },
    };
    expect(() => saveResume(RECORD)).not.toThrow();
    expect(loadResume(1)).toBeNull();
    expect(() => clearResume()).not.toThrow();
  });
});
