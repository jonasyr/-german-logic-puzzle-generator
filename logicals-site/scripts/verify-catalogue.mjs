/**
 * Erzeugt jeden Katalogeintrag neu und vergleicht den Fingerprint.
 *
 * Gemessen rund 94 Sekunden. Läuft deshalb nicht in `npm test`, sondern auf
 * Zuruf - und `test/catalogue.test.ts` sorgt dafür, dass man den Zuruf nicht
 * vergessen kann: sobald sich der Generator rührt, wird dort rot.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { generateGermanLogicBooklet } from '../vendor/logic-puzzle-generator/dist/src/germanBooklet.js';

const catalogue = JSON.parse(readFileSync(
  resolve(import.meta.dirname, '../client/js/catalogue/catalogue.json'), 'utf8'));

// Dieselbe Kanonisierung wie in scripts/build-catalogue.mjs, und die stammt
// wörtlich aus client/js/generation/canonicalPuzzle.ts.
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

function fingerprintOf(puzzle) {
  return createHash('sha256').update(JSON.stringify(sortKeys({
    categories: puzzle.categories,
    clues: puzzle.clues,
    targetQuestion: puzzle.targetQuestion,
    solutionRows: puzzle.solutionRows,
  }))).digest('hex');
}

let checked = 0;
const broken = [];
for (const chapter of catalogue.chapters) {
  for (const entry of chapter.entries) {
    try {
      const booklet = generateGermanLogicBooklet({
        puzzleCount: 1, categoryCount: entry.categoryCount,
        valuesPerCategory: entry.valuesPerCategory, themeId: chapter.themeId,
        difficulty: entry.difficulty, seed: entry.seed, targetCategoryIndex: 1,
      });
      const actual = fingerprintOf(booklet.puzzles[0]);
      if (actual !== entry.fingerprint) {
        broken.push(`${chapter.themeId} #${entry.number}: Fingerprint weicht ab`);
      }
    } catch (error) {
      broken.push(`${chapter.themeId} #${entry.number}: ${error.message}`);
    }
    checked += 1;
  }
}

console.log(`${checked} Einträge geprüft, ${broken.length} abweichend`);
for (const line of broken) console.log('  ' + line);
process.exit(broken.length === 0 ? 0 : 1);
