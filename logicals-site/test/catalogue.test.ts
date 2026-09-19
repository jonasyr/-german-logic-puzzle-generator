import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const catalogue = JSON.parse(
  readFileSync(resolve('client/js/catalogue/catalogue.json'), 'utf8'));

const RAMP = [
  [3, 4, 'leicht'], [3, 4, 'leicht'], [4, 4, 'leicht'], [4, 4, 'leicht'],
  [4, 4, 'mittel'], [4, 4, 'mittel'], [4, 5, 'mittel'], [4, 5, 'mittel'],
  [5, 5, 'mittel'], [5, 5, 'mittel'], [5, 5, 'schwer'], [5, 5, 'schwer'],
];

describe('Katalog', () => {
  it('hat zehn Kapitel mit je zwölf Einträgen', () => {
    expect(catalogue.chapters).toHaveLength(10);
    for (const chapter of catalogue.chapters) {
      expect(chapter.entries, chapter.themeId).toHaveLength(12);
    }
  });

  it('folgt in jedem Kapitel derselben Steigerung', () => {
    for (const chapter of catalogue.chapters) {
      const shape = chapter.entries.map((e: any) =>
        [e.categoryCount, e.valuesPerCategory, e.difficulty]);
      expect(shape, chapter.themeId).toEqual(RAMP);
    }
  });

  it('hält die Seeds vom freien Spiel getrennt', () => {
    // Das freie Spiel würfelt in 0…99.999. Ohne getrennte Bereiche bekäme man
    // einen Kapiteleintrag gutgeschrieben, den man zufällig getroffen hat.
    for (const chapter of catalogue.chapters) {
      for (const entry of chapter.entries) {
        expect(entry.seed, `${chapter.themeId} ${entry.number}`)
          .toBeGreaterThanOrEqual(1_000_000);
      }
    }
  });

  it('vergibt jeden Seed nur einmal', () => {
    const seeds = catalogue.chapters.flatMap((c: any) =>
      c.entries.map((e: any) => e.seed));
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  /*
   * Der Katalog kann nur ungültig werden, wenn sich der Generator ändert.
   * Diese Prüfung kostet Millisekunden und ersetzt damit im Alltag die
   * langsame Echtheitsprüfung: Ändert sich vendor/, wird sie rot und verweist
   * auf `npm run catalogue:verify`.
   */
  it('ist an genau diesen Generator gebunden', () => {
    const version = JSON.parse(readFileSync(
      resolve('vendor/logic-puzzle-generator/package.json'), 'utf8')).version;
    expect(catalogue.generatorVersion,
      'Generator-Version geändert - führe `npm run catalogue:verify` aus').toBe(version);

    const distDir = resolve('vendor/logic-puzzle-generator/dist');
    const hash = createHash('sha256');
    for (const name of readdirSync(distDir, { recursive: true }).sort()) {
      try { hash.update(readFileSync(resolve(distDir, String(name)))); } catch { /* Verzeichnis */ }
    }
    expect(catalogue.generatorHash,
      'Generator-Dateien geändert - führe `npm run catalogue:verify` aus')
      .toBe(`sha256:${hash.digest('hex')}`);
  });

  /*
   * Ein geänderter Seed macht den Eintrag für alle, die ihn gelöst haben, still
   * wieder offen - ohne Fehlermeldung, ohne Spur. Nur Anhängen ist erlaubt.
   */
  it('ändert keinen bestehenden Eintrag', () => {
    const tuples = catalogue.chapters.flatMap((c: any) => c.entries.map((e: any) =>
      `${c.themeId}|${e.number}|${e.categoryCount}x${e.valuesPerCategory}|${e.difficulty}|${e.seed}`));
    expect(tuples).toMatchSnapshot();
  });
});
