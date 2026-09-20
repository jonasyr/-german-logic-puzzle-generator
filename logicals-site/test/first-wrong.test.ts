import { describe, expect, it } from 'vitest';
import { createPlayState, firstWrongMark } from '../client/js/play/playState.js';

/*
 * „Prüfen" zeigte jede falsche Markierung auf einmal rot - deshalb steht im
 * Bestätigungsdialog auch die Warnung, das könne Lösungswege verraten. Wer
 * fünf Felder rot sieht, bekommt die halbe Lösung geschenkt.
 *
 * Eine einzige Stelle zu zeigen verrät weniger und lehrt mehr: nicht „hier ist
 * überall etwas faul", sondern „hier ist es gekippt".
 */

/** Ein Undo-Eintrag in der Form, die setMarkWith erzeugt. */
const entry = (...keys: string[]) => ({
  marks: keys.map(key => ({ key, previous: null })),
  auto: [],
});

/*
 * createPlayState kommt aus einer .js-Datei, also leitet TypeScript `undo: []`
 * als never[] ab und laesst nichts hineinschreiben. Der Zustand wird hier
 * absichtlich von Hand gestellt - das ist der Sinn dieser Tests -, deshalb
 * eine benannte Hilfe statt eines any an jeder Zuweisung.
 */
const withUndo = (state: ReturnType<typeof createPlayState>, ...entries: unknown[]) => {
  (state as { undo: unknown[] }).undo = entries;
  return state;
};

describe('erster falscher Schluss', () => {
  it('findet den frühesten Tipp, nicht den ersten im Gitter', () => {
    const state = createPlayState();
    // Getippt wurde in dieser Reihenfolge; "0.1.0.0" ist im Gitter früher,
    // wurde aber später gesetzt.
    withUndo(state, entry('0.2.1.1'), entry('0.1.0.0'));
    expect(firstWrongMark(state, new Set(['0.1.0.0', '0.2.1.1']))).toBe('0.2.1.1');
  });

  it('zeigt bei einer Bestätigung die Ursache, nicht das abgeleitete Kreuz', () => {
    const state = createPlayState();
    // Ein Tipp: die sichere Zuordnung zuerst, dann die Kreuze, die sie
    // erzwingt - alles in einem Eintrag. Der Tipp ist der lehrreiche Teil.
    withUndo(state, entry('0.1.0.0', '0.1.0.1', '0.1.0.2'));
    expect(firstWrongMark(state, new Set(['0.1.0.1', '0.1.0.0']))).toBe('0.1.0.0');
  });

  it('überspringt Einträge, in denen nichts falsch ist', () => {
    const state = createPlayState();
    withUndo(state, entry('0.1.0.0'), entry('0.1.1.1'), entry('0.2.0.0'));
    expect(firstWrongMark(state, new Set(['0.2.0.0']))).toBe('0.2.0.0');
  });

  it('gibt ohne Verlauf trotzdem eine Stelle zurück', () => {
    // Nach einem Neustart ist der Stapel leer - die Rücknahme-Historie gehört
    // zur Sitzung, nicht zum Spielstand. Eine Stelle zu zeigen ist dann immer
    // noch besser als alle; nur "die erste" darf man es nicht nennen.
    const state = createPlayState();
    expect(firstWrongMark(state, new Set(['0.1.0.0']))).toBe('0.1.0.0');
  });

  it('gibt nichts zurück, wenn nichts falsch ist', () => {
    const state = createPlayState();
    withUndo(state, entry('0.1.0.0'));
    expect(firstWrongMark(state, new Set())).toBe(null);
  });
});
