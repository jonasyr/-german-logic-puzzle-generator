import { describe, expect, it } from 'vitest';
import {
  chapterFor, chapters, entryAfter, newClueTypeAt, nextOpen, optionsFor, progressOf, totalProgress,
} from '../client/js/catalogue/catalogue.js';

const first = () => chapters()[0];

describe('Katalog lesen', () => {
  it('zählt den Fortschritt je Kapitel', () => {
    const chapter = first();
    const solved = new Set([chapter.entries[0].seed, chapter.entries[3].seed]);
    expect(progressOf(chapter, solved)).toEqual({ solved: 2, total: 12 });
  });

  it('zählt den Fortschritt über alles', () => {
    expect(totalProgress(new Set())).toEqual({ solved: 0, total: 120 });
  });

  it('schlägt den ersten offenen Eintrag vor, nicht den nach dem letzten gelösten', () => {
    // Springen ist erlaubt, also können Lücken hinter gelösten Einträgen
    // liegen. Der Vorschlag muss die Lücke schließen, nicht ans Ende zeigen.
    const chapter = first();
    const solved = new Set([chapter.entries[0].seed, chapter.entries[2].seed]);
    expect(nextOpen(chapter, solved)?.number).toBe(2);
  });

  it('gibt nichts zurück, wenn ein Kapitel fertig ist', () => {
    const chapter = first();
    expect(nextOpen(chapter, new Set(chapter.entries.map(e => e.seed)))).toBe(null);
  });

  it('baut die Generator-Optionen aus dem Eintrag', () => {
    const chapter = first();
    const entry = chapter.entries[4];
    expect(optionsFor(chapter, entry)).toEqual({
      puzzleCount: 1,
      categoryCount: entry.categoryCount,
      valuesPerCategory: entry.valuesPerCategory,
      themeId: chapter.themeId,
      difficulty: entry.difficulty,
      targetCategoryIndex: 1,
      seed: entry.seed,
    });
  });

  it('nennt eine Hinweisart nur dort, wo sie zum ersten Mal vorkommt', () => {
    const chapter = first();
    // Der erste Eintrag bringt die Grundarten mit; dort "neu" zu sagen wäre
    // keine Auskunft, sondern Lärm.
    expect(newClueTypeAt(chapter, 0)).toBe(null);

    const mentions = chapter.entries
      .map((_, index) => newClueTypeAt(chapter, index))
      .filter(Boolean);
    // Die Steigerung muss überhaupt etwas Neues einführen - sonst ist sie
    // keine Steigerung, sondern nur ein größeres Gitter.
    expect(mentions.length).toBeGreaterThan(0);
    // Und keine Art wird zweimal als neu angekündigt.
    expect(new Set(mentions).size).toBe(mentions.length);
  });

  it('kennt kein Kapitel, das es nicht gibt', () => {
    expect(chapterFor('gibtsnicht')).toBe(null);
  });
});

/*
 * Nach dem Lösen führte der staerkste Knopf im Gelöst-Dialog auf den
 * Startbildschirm - aus dem Spiel heraus, obwohl gerade Rätsel 1 von 12 eines
 * Kapitels gelöst wurde. Damit dort "Nächstes Rätsel" stehen kann, muss aus
 * einem Seed der folgende Eintrag ableitbar sein. Kein neuer Zustand: der
 * Seed steht ohnehin in den Optionen des laufenden Spiels.
 */
describe('der nächste Eintrag nach einem Seed', () => {
    it('findet den folgenden Eintrag desselben Kapitels', () => {
        const erstes = chapters()[0].entries[0];
        const folgend = entryAfter(erstes.seed);
        expect(folgend).not.toBeNull();
        expect(folgend!.entry.number).toBe(erstes.number + 1);
        expect(folgend!.chapter.themeId).toBe(chapters()[0].themeId);
    });

    it('gibt am Kapitelende nichts zurück - das nächste Kapitel ist ein eigener Schritt', () => {
        const kapitel = chapters()[0];
        const letztes = kapitel.entries[kapitel.entries.length - 1];
        expect(entryAfter(letztes.seed)).toBeNull();
    });

    it('kennt Seeds ausserhalb des Katalogs nicht', () => {
        // Freies Spiel würfelt in 0…99.999; dort gibt es kein "nächstes".
        expect(entryAfter(42)).toBeNull();
        expect(entryAfter(undefined)).toBeNull();
    });
});
