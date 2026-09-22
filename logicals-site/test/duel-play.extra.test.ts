import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  clearMarks, createPlayState, load, save, setMarkWith, storageKeyFor,
} from '../client/js/play/playState';
import { newestSavedGame } from '../client/js/play/savedGames';

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
  /*
   * Seit es den einen Fortsetzungs-Platz nicht mehr gibt, sucht der
   * Startbildschirm selbst: er geht die Schluessel durch und nimmt den
   * juengsten. Die Zusage ist dieselbe geblieben - ein Duell darf dabei nie
   * herauskommen, weil sein Raum laengst weg sein kann und sein Ergebnis in
   * den Raum gehoert, in dem es gespielt wurde.
   */
  const stand = (marks: number) => JSON.stringify({
    marks: Array.from({ length: marks }, (_, index) => [`0.1.${index}.0`, 'yes']),
    auto: [], usedClues: [], elapsedMs: 0, solved: false,
    options: {}, puzzleIndex: 0, fingerprint: 'f', title: 'T',
    savedAt: '2026-09-22T10:00:00.000Z',
  });

  function speicherMit(entries: Record<string, string>) {
    const keys = Object.keys(entries);
    return {
      get length() { return keys.length; },
      key: (index: number) => keys[index] ?? null,
      getItem: (key: string) => entries[key] ?? null,
      setItem: () => {}, removeItem: () => {},
    } as unknown as Storage;
  }

  it('is not what the start screen picks up', () => {
    const nurDuell = speicherMit({
      'logicals:play:duel:7:1:p:41:5x5:z': stand(1),
    });
    expect(newestSavedGame(1, nurDuell)).toBeNull();
  });

  it('is not handed to a different player either', () => {
    const solo = speicherMit({
      'logicals:play:solo:none:1:p:41:5x5:z': stand(1),
    });
    expect(newestSavedGame(2, solo)).toBeNull();
    expect(newestSavedGame(1, solo)).not.toBeNull();
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
    //
    // Asserting that every route into a mark change ends in the shared tail,
    // rather than counting call sites: an earlier version counted three and
    // broke the moment marking and undo were given one path instead of two,
    // which changed nothing about whether the opponent sees the count.
    const source = readFileSync('client/js/play/playController.js', 'utf8');

    const applyChange = source.match(/function applyChange\([\s\S]*?\n}/)?.[0] ?? '';
    expect(applyChange, 'applyChange must exist').not.toBe('');
    expect(applyChange).toContain('progress?.report(state.marks.size)');

    for (const caller of ['function afterMarkChange(', 'function onUndo(']) {
      const body = source.slice(source.indexOf(caller));
      expect(body.slice(0, body.indexOf('\n}')), caller).toContain('applyChange(');
    }

    // Clearing reports zero rather than the stale previous count.
    const onClear = source.match(/function onClear\([\s\S]*?\n}/)?.[0] ?? '';
    expect(onClear).toContain('progress?.report(0)');
  });
});
