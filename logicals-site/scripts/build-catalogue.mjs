/**
 * Baut den Katalog: 10 Kapitel à 12 Einträge.
 *
 * Nicht jeder Seed kommt durch das Qualitätstor des Generators. In einer
 * unendlichen Liste ist das folgenlos - man bekommt das nächste Rätsel. In
 * einem endlichen Kapitel wäre Eintrag 7 für immer tot. Deshalb wird jeder
 * Eintrag hier einmal wirklich erzeugt, und ein Seed, der scheitert, wird
 * übersprungen statt eingetragen.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  generateGermanLogicBooklet, listGermanThemes,
} from '../vendor/logic-puzzle-generator/dist/src/germanBooklet.js';

/** Erst wächst das Gitter, dann die Schwierigkeit. */
const RAMP = [
  [3, 4, 'leicht'], [3, 4, 'leicht'],
  [4, 4, 'leicht'], [4, 4, 'leicht'],
  [4, 4, 'mittel'], [4, 4, 'mittel'],
  [4, 5, 'mittel'], [4, 5, 'mittel'],
  [5, 5, 'mittel'], [5, 5, 'mittel'],
  [5, 5, 'schwer'], [5, 5, 'schwer'],
];

/** Getrennt vom freien Spiel, das in 0…99.999 würfelt. */
const SEED_FLOOR = 1_000_000;

/** Ein Hash über den Generator, damit der Katalog merkt, wenn er sich ändert. */
export function generatorHash(distDir) {
  const hash = createHash('sha256');
  for (const name of readdirSync(distDir, { recursive: true }).sort()) {
    const path = resolve(distDir, String(name));
    try { hash.update(readFileSync(path)); } catch { /* Verzeichnis */ }
  }
  return `sha256:${hash.digest('hex')}`;
}

function buildChapter(theme, chapterIndex) {
  const entries = [];
  let seed = SEED_FLOOR + chapterIndex * 10_000;

  for (const [categoryCount, valuesPerCategory, difficulty] of RAMP) {
    // Solange weitersuchen, bis ein Seed wirklich ein Rätsel ergibt.
    for (;;) {
      seed += 1;
      try {
        const booklet = generateGermanLogicBooklet({
          puzzleCount: 1, categoryCount, valuesPerCategory,
          themeId: theme.id, difficulty, seed, targetCategoryIndex: 1,
        });
        const puzzle = booklet.puzzles[0];
        if (!puzzle) continue;
        entries.push({
          number: entries.length + 1,
          categoryCount, valuesPerCategory, difficulty, seed,
          fingerprint: fingerprintOf(puzzle),
          clueTypes: puzzle.clueTypes,
        });
        break;
      } catch { /* dieser Seed nicht; der nächste */ }
    }
  }
  return { themeId: theme.id, title: theme.title, entries };
}

/**
 * Dieselbe Rechnung wie client/js/generation/canonicalPuzzle.ts.
 *
 * Bewusst hier wiederholt statt importiert: das Skript läuft in Node, die
 * Client-Fassung nutzt die WebCrypto-API des Browsers. Die Form ist wörtlich
 * von dort übernommen - vier Felder (einschließlich targetQuestion), die
 * Kategorien vollständig statt auf label/values verkürzt, und alle
 * Objektschlüssel rekursiv nach localeCompare sortiert.
 */
function sortKeys(value) {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, sortKeys(nested)]),
    );
  }
  if (value === null || ['boolean', 'number', 'string'].includes(typeof value)) {
    return value;
  }
  throw new TypeError('Puzzle data must be JSON serializable.');
}

function canonicalPuzzle(puzzle) {
  return JSON.stringify(sortKeys({
    categories: puzzle.categories,
    clues: puzzle.clues,
    targetQuestion: puzzle.targetQuestion,
    solutionRows: puzzle.solutionRows,
  }));
}

function fingerprintOf(puzzle) {
  return createHash('sha256').update(canonicalPuzzle(puzzle)).digest('hex');
}

const root = resolve(import.meta.dirname, '..');
const distDir = resolve(root, 'vendor/logic-puzzle-generator/dist');
const version = JSON.parse(
  readFileSync(resolve(root, 'vendor/logic-puzzle-generator/package.json'), 'utf8')).version;

const catalogue = {
  generatorVersion: version,
  generatorHash: generatorHash(distDir),
  chapters: listGermanThemes().map(buildChapter),
};

writeFileSync(
  resolve(root, 'client/js/catalogue/catalogue.json'),
  `${JSON.stringify(catalogue, null, 2)}\n`,
);
console.log(`${catalogue.chapters.length} Kapitel, `
  + `${catalogue.chapters.reduce((n, c) => n + c.entries.length, 0)} Einträge`);
