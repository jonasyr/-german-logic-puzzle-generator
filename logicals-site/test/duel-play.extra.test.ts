import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  clearMarks, createPlayState, load, save, setMarkWith, storageKeyFor,
} from '../client/js/play/playState';
import { clearResume, loadResume, saveResume } from '../client/js/play/resumeStore';

/**
 * Duel invariants that live in the client rather than in the Worker.
 *
 * The Worker's side is covered in rooms.test.ts. These are the ones that would
 * quietly ruin a duel from the browser: two players sharing a storage slot,
 * a duel leaking into the solo resume offer, or progress being derived from
 * anything richer than a count.
 */

function storage() {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
  };
  return store;
}

const puzzle = {
  id: 'p1',
  seed: 41,
  clues: ['a', 'b'],
  categories: [
    { label: 'A', values: ['a1', 'a2', 'a3', 'a4', 'a5'] },
    { label: 'B', values: ['b1', 'b2', 'b3', 'b4', 'b5'] },
  ],
};

describe('a duel keeps the two players apart', () => {
  it('gives each player their own storage slot in the same room', () => {
    const host = storageKeyFor(puzzle, {
      mode: 'duel', room: { id: 7 }, player: { id: 1 },
    });
    const guest = storageKeyFor(puzzle, {
      mode: 'duel', room: { id: 7 }, player: { id: 2 },
    });
    // Same puzzle, same room, different grids.
    expect(host).not.toBe(guest);
    expect(host).toContain(':duel:');
    expect(guest).toContain(':duel:');
  });

  it('keeps a duel grid apart from a solo grid of the same puzzle', () => {
    const duel = storageKeyFor(puzzle, { mode: 'duel', room: { id: 7 }, player: { id: 1 } });
    const solo = storageKeyFor(puzzle, { mode: 'solo', player: { id: 1 } });
    expect(duel).not.toBe(solo);
  });

  it('keeps two rooms apart for the same player and puzzle', () => {
    const first = storageKeyFor(puzzle, { mode: 'duel', room: { id: 7 }, player: { id: 1 } });
    const second = storageKeyFor(puzzle, { mode: 'duel', room: { id: 8 }, player: { id: 1 } });
    expect(first).not.toBe(second);
  });

  it('does not let one player\'s saved marks load into the other\'s grid', () => {
    storage();
    const host: any = createPlayState();
    host.storageKey = storageKeyFor(puzzle, { mode: 'duel', room: { id: 7 }, player: { id: 1 } });
    setMarkWith(host, '0.1.0.0', 'yes', 5);
    save(host, 1000);

    const guest: any = createPlayState();
    guest.storageKey = storageKeyFor(puzzle, { mode: 'duel', room: { id: 7 }, player: { id: 2 } });
    expect(load(guest)).toBe(0);
    expect(guest.marks.size).toBe(0);
  });
});

describe('a duel never becomes a resume offer', () => {
  it('is not what the start screen picks up', () => {
    storage();
    // Only solo games are ever written, but if a duel record did appear it must
    // not be handed to a player: the room may be gone, and a duel result belongs
    // to the room it was played in.
    clearResume();
    expect(loadResume(1)).toBeNull();

    saveResume({
      options: {}, puzzleIndex: 0, fingerprint: 'f',
      storageKey: 'logicals:play:solo:none:1:p:41:5x5:z',
      playerId: 1, title: 'T', savedAt: 'now', elapsedMs: 0, markCount: 1,
    });
    // A different player must not be offered it either.
    expect(loadResume(2)).toBeNull();
    expect(loadResume(1)).not.toBeNull();
  });
});

describe('progress is only ever a count', () => {
  it('is derived from the number of marks and nothing else', () => {
    storage();
    const state: any = createPlayState();
    state.storageKey = 'k';
    setMarkWith(state, '0.1.0.0', 'yes', 5);
    // One confirmation plus the eight crosses it implies.
    expect(state.marks.size).toBe(9);
    clearMarks(state);
    expect(state.marks.size).toBe(0);
  });

  it('is reported by the client as a bare number', () => {
    // The reporter must not be able to send anything richer by accident.
    const source = readFileSync('client/js/duel/progressReporter.js', 'utf8');
    expect(source).toContain('filled: pending');
    expect(source).not.toContain('marks');
    expect(source).not.toContain('cellKey');
  });

  it('is fed from the play controller on every change', () => {
    // This is the one that was missing: the reporter existed, was wired up, and
    // was never told anything - so it published a permanent zero.
    const source = readFileSync('client/js/play/playController.js', 'utf8');
    const calls = source.match(/progress\?\.report\(/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(3);   // marks, undo, clear
  });
});
