# Daily Puzzle, Calmer Shell, Statistics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make one tap the way into a puzzle, stop volatile text from moving the layout, and add a statistics screen.

**Architecture:** The daily puzzle is derived, never stored: a seed from the Europe/Berlin date, a fixed 5×5 shape, and a difficulty from the weekday. Whether it has been solved, and the streak, are decided by matching stored results against those derived seeds, so nothing new goes in the database. Statistics are computed on the client from the history endpoint by a module with no DOM. The shell work is one rule — text that comes and goes is positioned out of flow — plus two preferences.

**Tech Stack:** Vanilla ES modules, Vitest 4 (node, no DOM), Playwright 1.55.

**Spec:** `docs/superpowers/specs/2026-09-18-daily-puzzle-and-stats-design.md`

## Global Constraints

- Base branch `redesign/mobile-canvas-overview` at `ed83c96` or later.
- No new database table, column or endpoint. No change to the generator, the duel protocol, result scoring or attribution.
- The Vitest environment is **node with no DOM**. Pure modules get unit tests; anything touching the DOM is covered by Playwright.
- `npm ci --ignore-scripts` in `logicals-site/` — plain `npm ci` fails on `sharp` under Node 25.
- Commit messages contain only the message: no `Co-Authored-By`, no tool footer, no emoji.
- Do not touch the ChatGPT Site. Deployment is a separate step requiring explicit approval.
- Every task ends green on `npx vitest run --root . test`, `npx tsc --noEmit`, `npm run build`.
- **The FNV-1a hash must keep producing byte-identical output.** It feeds `storageKeyFor`; a different hash orphans every saved game.
- The daily date is always `Europe/Berlin`, never the device timezone.
- Failed checks are presented beside elapsed time, never beneath it.

---

## File Structure

**Create**
- `logicals-site/client/js/util/hash.js` — FNV-1a, in both the numeric and the base36 form the existing code needs.
- `logicals-site/client/js/play/dailyPuzzle.js` — date, seed, difficulty, options, and the result-matching rules. Pure.
- `logicals-site/client/js/stats/statistics.js` — every statistic, computed from result rows. Pure.
- `logicals-site/client/js/screens/statsScreen.js` — renders them.
- `logicals-site/test/hash.test.ts`
- `logicals-site/test/daily-puzzle.test.ts`
- `logicals-site/test/statistics.test.ts`
- `logicals-site/e2e/daily-and-stats.spec.ts`

**Modify**
- `logicals-site/client/js/play/playState.js` — use the shared hash.
- `logicals-site/client/js/main.js` — daily button, stats button, wiring.
- `logicals-site/client/js/screens/configScreen.js` — drop the print fields.
- `logicals-site/client/js/play/playPrefs.js` — `hideClock`, `hideDuel`.
- `logicals-site/client/index.html` — start screen, stats screen, settings switches.
- `logicals-site/client/styles/{screens,play,components}.css` — out-of-flow text, reduced motion, stats.
- `logicals-site/e2e/{solo,duel,ios-layout,overview-canvas,play-sprint}.spec.ts` — they select `#field-puzzleCount`, which is being removed.

---

# Phase 1 — Daily puzzle

### Task 1: The shared hash

**Files:**
- Create: `logicals-site/client/js/util/hash.js`
- Modify: `logicals-site/client/js/play/playState.js`
- Test: `logicals-site/test/hash.test.ts`

**Interfaces:**
- Produces: `fnv1a(text) -> number` (unsigned 32-bit), `fnv1a36(text) -> string`.

**Why both forms:** `playState.js` currently ends its hash with `.toString(36)` and feeds the
result into `storageKeyFor`. The daily seed needs the number. Extracting only the numeric
form and re-adding `.toString(36)` at the call site would be identical — but a single
`fnv1a36` keeps the storage-key path impossible to get subtly wrong.

- [ ] **Step 1: Write the failing test**

```ts
// logicals-site/test/hash.test.ts
import { describe, expect, it } from 'vitest';
import { fnv1a, fnv1a36 } from '../client/js/util/hash';

describe('fnv1a', () => {
  it('is deterministic', () => {
    expect(fnv1a('2026-09-18')).toBe(fnv1a('2026-09-18'));
  });

  it('separates neighbouring days', () => {
    expect(fnv1a('2026-09-18')).not.toBe(fnv1a('2026-09-19'));
  });

  it('stays an unsigned 32-bit integer', () => {
    for (const text of ['', 'a', '2026-09-18', 'x'.repeat(500)]) {
      const value = fnv1a(text);
      expect(Number.isSafeInteger(value)).toBe(true);
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(2 ** 32);
    }
  });

  it('reproduces the exact values storage keys already contain', () => {
    // These are byte-for-byte what the inline hash in playState produced. If
    // this test ever needs updating, every saved game has just been orphaned.
    expect(fnv1a36('')).toBe((0x811c9dc5 >>> 0).toString(36));
    expect(fnv1a36('a')).toBe((Math.imul(0x811c9dc5 ^ 97, 0x01000193) >>> 0).toString(36));
  });

  it('agrees with itself across the two forms', () => {
    expect(fnv1a36('2026-09-18')).toBe(fnv1a('2026-09-18').toString(36));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/hash.test.ts`
Expected: FAIL — cannot resolve `../client/js/util/hash`.

- [ ] **Step 3: Write the implementation**

```js
// logicals-site/client/js/util/hash.js
/**
 * FNV-1a, 32 bit.
 *
 * Lifted unchanged out of playState.js, where it fingerprints clue sets for
 * storage keys. Its output is therefore load-bearing: a different hash would
 * orphan every saved game on every device. The daily puzzle needs the numeric
 * form, hence the pair.
 */

export function fnv1a(text) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

/** The short, stable spelling that storage keys are built from. */
export function fnv1a36(text) {
    return fnv1a(text).toString(36);
}
```

- [ ] **Step 4: Point playState at it**

In `playState.js`, add the import and delete the local `fingerprint`:

```js
import { fnv1a36 } from '../util/hash.js';
```

and in `storageKeyFor`, replace `fingerprint(...)` with `fnv1a36(...)`:

```js
    const clues = fnv1a36(puzzle.clues.join('\0'));
```

- [ ] **Step 5: Run the tests to verify nothing moved**

Run: `cd logicals-site && npx vitest run --root . test && npx tsc --noEmit`
Expected: PASS. `play-implications.test.ts` exercises `storageKeyFor` through
persistence; if it fails, the hash changed and the extraction is wrong.

- [ ] **Step 6: Commit**

```bash
git add logicals-site/client/js/util/hash.js logicals-site/client/js/play/playState.js logicals-site/test/hash.test.ts
git commit -m "refactor(play): share the storage-key hash"
```

---

### Task 2: The daily puzzle rules

**Files:**
- Create: `logicals-site/client/js/play/dailyPuzzle.js`
- Test: `logicals-site/test/daily-puzzle.test.ts`

**Interfaces:**
- Consumes: `fnv1a` from Task 1.
- Produces:
  - `DAILY_CATEGORIES = 5`, `DAILY_VALUES = 5`
  - `berlinDate(when = new Date()) -> 'YYYY-MM-DD'`
  - `dailySeed(date) -> number`
  - `dailyDifficulty(date) -> 'leicht' | 'mittel' | 'schwer'`
  - `dailyOptions(date) -> booklet options for that day`
  - `isDailyResult(result) -> boolean`
  - `dailyStreak(results, today) -> number`

- [ ] **Step 1: Write the failing test**

```ts
// logicals-site/test/daily-puzzle.test.ts
import { describe, expect, it } from 'vitest';
import {
  DAILY_CATEGORIES, DAILY_VALUES,
  berlinDate, dailyDifficulty, dailyOptions, dailySeed, dailyStreak, isDailyResult,
} from '../client/js/play/dailyPuzzle';

/** A solved result for a given date, at that date's daily seed unless told otherwise. */
function resultOn(date: string, overrides: Record<string, unknown> = {}) {
  return {
    seed: dailySeed(date),
    completedAt: `${date}T12:00:00.000Z`,
    configuration: { categoryCount: DAILY_CATEGORIES, valuesPerCategory: DAILY_VALUES },
    ...overrides,
  };
}

describe('which day it is', () => {
  it('reads the date in Berlin, not in the device timezone', () => {
    // 22:30 UTC on the 18th is already the 19th in Berlin (CEST, UTC+2).
    expect(berlinDate(new Date('2026-09-18T22:30:00Z'))).toBe('2026-09-19');
    // And 01:00 UTC is still the same German day it started.
    expect(berlinDate(new Date('2026-09-18T01:00:00Z'))).toBe('2026-09-18');
  });

  it('is stable across winter time too', () => {
    // January: CET, UTC+1.
    expect(berlinDate(new Date('2026-01-15T23:30:00Z'))).toBe('2026-01-16');
    expect(berlinDate(new Date('2026-01-15T22:30:00Z'))).toBe('2026-01-15');
  });
});

describe('the daily seed', () => {
  it('is the same for everyone on the same German day', () => {
    expect(dailySeed('2026-09-18')).toBe(dailySeed('2026-09-18'));
  });

  it('differs from one day to the next', () => {
    const seeds = ['2026-09-16', '2026-09-17', '2026-09-18', '2026-09-19']
      .map(dailySeed);
    expect(new Set(seeds).size).toBe(4);
  });

  it('is an integer the generator will accept', () => {
    const seed = dailySeed('2026-09-18');
    expect(Number.isSafeInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
  });
});

describe('the weekday rotation', () => {
  it('is gentle early in the week and hardest at the weekend', () => {
    // 2026-09-14 is a Monday.
    expect(dailyDifficulty('2026-09-14')).toBe('leicht');   // Mo
    expect(dailyDifficulty('2026-09-15')).toBe('leicht');   // Tu
    expect(dailyDifficulty('2026-09-16')).toBe('leicht');   // We
    expect(dailyDifficulty('2026-09-17')).toBe('mittel');   // Th
    expect(dailyDifficulty('2026-09-18')).toBe('mittel');   // Fr
    expect(dailyDifficulty('2026-09-19')).toBe('schwer');   // Sa
    expect(dailyDifficulty('2026-09-20')).toBe('schwer');   // Su
  });

  it('repeats weekly, so it is learnable', () => {
    expect(dailyDifficulty('2026-09-21')).toBe(dailyDifficulty('2026-09-14'));
  });
});

describe('the options it generates with', () => {
  it('fixes the shape so everyone\'s time means the same thing', () => {
    const options = dailyOptions('2026-09-18');
    expect(options.categoryCount).toBe(DAILY_CATEGORIES);
    expect(options.valuesPerCategory).toBe(DAILY_VALUES);
    expect(options.puzzleCount).toBe(1);
    expect(options.seed).toBe(dailySeed('2026-09-18'));
    expect(options.difficulty).toBe('mittel');
  });
});

describe('recognising a daily result', () => {
  it('matches a result played on its own day', () => {
    expect(isDailyResult(resultOn('2026-09-18'))).toBe(true);
  });

  it('rejects a custom puzzle that merely shares the seed number', () => {
    // Same seed, different shape: not the daily puzzle everyone else played.
    expect(isDailyResult(resultOn('2026-09-18', {
      configuration: { categoryCount: 4, valuesPerCategory: 5 },
    }))).toBe(false);
  });

  it('rejects yesterday\'s seed played today', () => {
    expect(isDailyResult(resultOn('2026-09-18', {
      seed: dailySeed('2026-09-17'),
    }))).toBe(false);
  });

  it('judges by the German day the result was completed on', () => {
    // 22:30 UTC on the 18th is the 19th in Berlin, so the 19th's seed is right.
    expect(isDailyResult({
      seed: dailySeed('2026-09-19'),
      completedAt: '2026-09-18T22:30:00.000Z',
      configuration: { categoryCount: 5, valuesPerCategory: 5 },
    })).toBe(true);
  });

  it('survives a row with no configuration', () => {
    expect(() => isDailyResult({
      seed: 1, completedAt: '2026-09-18T12:00:00.000Z',
    })).not.toThrow();
  });
});

describe('the streak', () => {
  it('counts consecutive days back from today', () => {
    const results = ['2026-09-18', '2026-09-17', '2026-09-16'].map(date => resultOn(date));
    expect(dailyStreak(results, '2026-09-18')).toBe(3);
  });

  it('is not broken by today being unplayed yet', () => {
    // Yesterday and the day before still count while today is open.
    const results = ['2026-09-17', '2026-09-16'].map(date => resultOn(date));
    expect(dailyStreak(results, '2026-09-18')).toBe(2);
  });

  it('is broken by a missed day', () => {
    const results = ['2026-09-18', '2026-09-16'].map(date => resultOn(date));
    expect(dailyStreak(results, '2026-09-18')).toBe(1);
  });

  it('counts a day once however often it was replayed', () => {
    const results = [resultOn('2026-09-18'), resultOn('2026-09-18')];
    expect(dailyStreak(results, '2026-09-18')).toBe(1);
  });

  it('ignores results that are not daily puzzles', () => {
    const results = [resultOn('2026-09-18', { seed: 12345 })];
    expect(dailyStreak(results, '2026-09-18')).toBe(0);
  });

  it('is zero with no history at all', () => {
    expect(dailyStreak([], '2026-09-18')).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/daily-puzzle.test.ts`
Expected: FAIL — cannot resolve `../client/js/play/dailyPuzzle`.

- [ ] **Step 3: Write the implementation**

```js
// logicals-site/client/js/play/dailyPuzzle.js
/**
 * One puzzle per day, derived rather than stored.
 *
 * Everything here is a pure function of a date, so the same day yields the same
 * puzzle on every device without a table, an endpoint or a round trip - and
 * whether somebody has played it is decided by matching results that already
 * exist against the seed their own completion date implies.
 */

import { fnv1a } from '../util/hash.js';

/** Fixed, so that two people's times measure the same work. */
export const DAILY_CATEGORIES = 5;
export const DAILY_VALUES = 5;

/**
 * Indexed by Date#getUTCDay: 0 is Sunday.
 *
 * The crossword convention - gentler early in the week, hardest at the weekend
 * when there is time for it. Printed on the button, so it is never a surprise,
 * and weekly, so it is learnable.
 */
const DIFFICULTY_BY_WEEKDAY = [
    'schwer',  // Sunday
    'leicht',  // Monday
    'leicht',
    'leicht',
    'mittel',  // Thursday
    'mittel',
    'schwer',  // Saturday
];

const BERLIN_DATE = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * The calendar date in Germany, whatever the device's clock is set to.
 *
 * Comparability is the whole point of a daily puzzle: two friends must not get
 * different puzzles because one of them is travelling. `en-CA` is the shortest
 * route to an ISO-shaped date from Intl.
 */
export function berlinDate(when = new Date()) {
    return BERLIN_DATE.format(when);
}

export function dailySeed(date) {
    return fnv1a(date);
}

export function dailyDifficulty(date) {
    // Noon UTC, so neither end of a daylight-saving shift can move the weekday.
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return DIFFICULTY_BY_WEEKDAY[weekday];
}

/** What the generator is asked for on a given day. */
export function dailyOptions(date) {
    return {
        puzzleCount: 1,
        categoryCount: DAILY_CATEGORIES,
        valuesPerCategory: DAILY_VALUES,
        difficulty: dailyDifficulty(date),
        targetCategoryIndex: 1,
        themeId: 'standard',
        seed: dailySeed(date),
    };
}

/**
 * Whether a stored result is one of the daily puzzles.
 *
 * Seed AND shape: a custom 4x5 puzzle that happened to be generated with the
 * day's seed number is not the puzzle everybody else played, and must not count
 * towards a streak.
 */
export function isDailyResult(result) {
    if (!result?.completedAt) return false;
    const date = berlinDate(new Date(result.completedAt));
    if (result.seed !== dailySeed(date)) return false;
    const configuration = result.configuration ?? {};
    // A row without a configuration is judged on its seed alone rather than
    // discarded; the shape check is a guard, not a requirement.
    if (configuration.categoryCount === undefined) return true;
    return configuration.categoryCount === DAILY_CATEGORIES
        && configuration.valuesPerCategory === DAILY_VALUES;
}

function previousDay(date) {
    const moment = new Date(`${date}T12:00:00Z`);
    moment.setUTCDate(moment.getUTCDate() - 1);
    return moment.toISOString().slice(0, 10);
}

/**
 * Consecutive days ending today.
 *
 * Today being unplayed does not break a streak - it is not over yet - so the
 * walk starts at yesterday when today is missing. Days are counted, not
 * results, so replaying a daily changes nothing.
 */
export function dailyStreak(results, today) {
    const days = new Set();
    for (const result of results) {
        if (isDailyResult(result)) days.add(berlinDate(new Date(result.completedAt)));
    }

    let day = days.has(today) ? today : previousDay(today);
    let streak = 0;
    while (days.has(day)) {
        streak++;
        day = previousDay(day);
    }
    return streak;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd logicals-site && npx vitest run --root . test/daily-puzzle.test.ts`
Expected: PASS, 19 tests.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/js/play/dailyPuzzle.js logicals-site/test/daily-puzzle.test.ts
git commit -m "feat(play): derive one puzzle per day from the Berlin date"
```

---

### Task 3: The daily puzzle on the start screen

**Files:**
- Modify: `logicals-site/client/index.html`
- Modify: `logicals-site/client/js/main.js`
- Modify: `logicals-site/client/styles/screens.css`

**Interfaces:**
- Consumes: everything from Task 2; `fetchBooklet` from `./api.js`; `listPlayerResults` from `./players/playerApi.js`; `openPlay`.
- Produces: a working daily button; `refreshStartScreen()` replacing `refreshResumeButton()`.

- [ ] **Step 1: Add the markup**

In `index.html`, inside `.start-actions`, immediately after `#player-button`:

```html
                <button class="btn btn--primary btn--large btn--block" type="button" id="daily-button" disabled>Rätsel des Tages</button>
                <p class="start-note" id="daily-detail"></p>
```

and after `#history-button`:

```html
                <button class="btn btn--on-dark btn--block" id="stats-button" type="button" disabled>Statistik</button>
```

- [ ] **Step 2: Wire the daily puzzle**

In `main.js`, add the imports:

```js
import {
    berlinDate, dailyDifficulty, dailyOptions, dailySeed, dailyStreak, isDailyResult,
} from './play/dailyPuzzle.js';
import { listPlayerResults } from './players/playerApi.js';
```

Add these functions beside `refreshResumeButton`:

```js
const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function describeDay(date) {
    const moment = new Date(`${date}T12:00:00Z`);
    const day = moment.getUTCDate();
    const month = moment.toLocaleDateString('de-DE', { month: 'long', timeZone: 'UTC' });
    return `${WEEKDAYS[moment.getUTCDay()]}, ${day}. ${month}`;
}

/**
 * Opens today's puzzle.
 *
 * Generated from the day's options rather than fetched: the seed is the date, so
 * the result is the same puzzle for everyone without anything being stored.
 */
async function playDaily() {
    const player = getSelectedPlayer();
    if (!player) return;
    const date = berlinDate();
    const options = dailyOptions(date);

    setBusy('Rätsel des Tages wird erzeugt …');
    try {
        const generated = await fetchBooklet(options);
        const puzzle = generated.booklet.puzzles[0];
        if (!puzzle) throw new Error('Das Rätsel des Tages konnte nicht erzeugt werden.');
        setHint('start-hint', '');
        openPlay(puzzle, { mode: 'solo', player, options, puzzleIndex: 0 });
    } catch (error) {
        setHint('start-hint', error.message, true);
    } finally {
        clearBusy();
    }
}

/**
 * Says what today holds, and what has already been done with it.
 *
 * The history call is best effort: no network must not leave the player unable
 * to start a puzzle that does not need the network to generate.
 */
async function refreshDailyButton() {
    const button = el('daily-button');
    const detail = el('daily-detail');
    const player = getSelectedPlayer();
    button.disabled = !player;
    if (!player) { detail.hidden = true; return; }

    const date = berlinDate();
    detail.hidden = false;
    button.textContent = 'Rätsel des Tages';
    detail.textContent = `${describeDay(date)} · ${dailyDifficulty(date)}`;

    // 100 explicitly: the client default is 50, and a streak must be able to
    // reach back further than that. The Worker rejects anything above 100 with
    // a 400 rather than clamping, so 100 is both the maximum and the ceiling.
    let results = [];
    try { results = await listPlayerResults(player.id, 100); } catch { return; }

    const seed = dailySeed(date);
    const solved = results.find(result => isDailyResult(result) && result.seed === seed);
    const streak = dailyStreak(results, date);
    if (!solved) {
        if (streak > 0) detail.textContent += ` · Serie: ${streak} Tage`;
        return;
    }

    button.textContent = 'Nochmal spielen';
    const minutes = Math.floor(solved.elapsedMs / 60_000);
    const seconds = Math.floor((solved.elapsedMs % 60_000) / 1000);
    detail.textContent = `Heute gelöst · ${minutes}:${String(seconds).padStart(2, '0')}`
        + (streak > 0 ? ` · Serie: ${streak} Tage` : '');
}
```

- [ ] **Step 3: Replace the single refresh with one that covers the screen**

Rename `refreshResumeButton` to `refreshStartScreen` and have it drive both:

```js
function refreshStartScreen() {
    const button = el('resume-button');
    const detail = el('resume-detail');
    const player = getSelectedPlayer();
    const record = player ? loadResume(player.id) : null;
    button.hidden = !record;
    detail.hidden = !record;
    if (record) detail.textContent = describeResume(record);

    el('stats-button').disabled = !player;

    // An interrupted puzzle is a stronger claim on attention than a fresh one,
    // so it takes the primary slot when both are on offer.
    el('daily-button').classList.toggle('btn--primary', !record);
    el('daily-button').classList.toggle('btn--on-dark', Boolean(record));
    const start = el('start-button');
    start.classList.toggle('btn--primary', false);
    start.classList.toggle('btn--on-dark', true);

    refreshDailyButton().catch(() => { /* best effort, see above */ });
}
```

Replace every remaining call to `refreshResumeButton()` with `refreshStartScreen()`, and
add the listener in `wire()`:

```js
    el('daily-button').addEventListener('click', playDaily);
```

- [ ] **Step 4: Style the caption**

`.start-note` already exists from the resume work and needs no change. Confirm it:

Run: `cd logicals-site && grep -n "start-note" client/styles/screens.css`
Expected: a `.start-note` rule and a `.start-note[hidden]` rule.

- [ ] **Step 5: Verify**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test && npm run build`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add logicals-site/client/index.html logicals-site/client/js/main.js
git commit -m "feat(play): make the daily puzzle the way in"
```

---

### Task 4: End-to-end proof of the daily puzzle

**Files:**
- Create: `logicals-site/e2e/daily-and-stats.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// logicals-site/e2e/daily-and-stats.spec.ts
import { expect, test, type Page } from '@playwright/test';

async function withPlayer(page: Page, results: unknown[] = []) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  await page.route('**/api/players', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-18T00:00:00Z' }] }),
  }));
  await page.route('**/api/players/1/results*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results }),
  }));
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
}

/** The seed and difficulty the app itself derives, asked of the page. */
async function today(page: Page) {
  return page.evaluate(async () => {
    const daily = await import('./js/play/dailyPuzzle.js');
    const date = daily.berlinDate();
    return { date, seed: daily.dailySeed(date), difficulty: daily.dailyDifficulty(date) };
  });
}

test('one tap starts today\'s puzzle, with no form in between', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');

  const daily = await today(page);
  await expect(page.locator('#daily-detail')).toContainText(daily.difficulty);

  await page.locator('#daily-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
  // Straight into the grid: the settings screen was never shown.
  await expect(page.locator('#screen-config')).not.toHaveClass(/is-active/);
});

test('two devices get the same daily puzzle', async ({ browser }) => {
  test.setTimeout(240_000);
  const titles: string[] = [];
  for (const timezoneId of ['Europe/Berlin', 'America/New_York']) {
    const context = await browser.newContext({ timezoneId, viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await withPlayer(page);
    await page.goto('/');
    await page.locator('#daily-button').click();
    await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
    titles.push((await page.locator('#play-title').textContent()) ?? '');
    await context.close();
  }
  // Comparability is the whole point; a different timezone must not change it.
  expect(titles[0]).toBe(titles[1]);
  expect(titles[0]).not.toBe('');
});

test('a solved daily says so, with the streak', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });

  // Seed the history with today's daily and the two days before it.
  await withPlayer(page);
  await page.goto('/');
  const daily = await today(page);
  const history = await page.evaluate(async ({ date }) => {
    const module = await import('./js/play/dailyPuzzle.js');
    const back = (days: number) => {
      const moment = new Date(`${date}T12:00:00Z`);
      moment.setUTCDate(moment.getUTCDate() - days);
      return moment.toISOString().slice(0, 10);
    };
    return [0, 1, 2].map(offset => ({
      id: offset + 1, playerId: 1, roomId: null, attemptKey: `k${offset}`,
      puzzleFingerprint: 'f', puzzleTitle: 'Heute', themeId: 'standard',
      difficulty: 'mittel', seed: module.dailySeed(back(offset)),
      configuration: { categoryCount: 5, valuesPerCategory: 5 },
      elapsedMs: 492_000, failedChecks: 1,
      completedAt: `${back(offset)}T12:00:00.000Z`,
      opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
    }));
  }, { date: daily.date });

  await withPlayer(page, history);
  await page.reload();

  await expect(page.locator('#daily-button')).toHaveText('Nochmal spielen');
  await expect(page.locator('#daily-detail')).toContainText('Heute gelöst · 8:12');
  await expect(page.locator('#daily-detail')).toContainText('Serie: 3 Tage');
});
```

- [ ] **Step 2: Run it**

Run: `cd logicals-site && npx playwright test e2e/daily-and-stats.spec.ts --reporter=line`
Expected: PASS, 3 tests.

- [ ] **Step 3: Commit**

```bash
git add logicals-site/e2e/daily-and-stats.spec.ts
git commit -m "test(play): cover the daily puzzle, including two timezones"
```

---

# Phase 2 — A calmer shell

### Task 5: Volatile text leaves the layout

> **Amended during execution.** The CSS below was written before the approach was
> tried, and it is wrong in two ways that only running it revealed. Both the
> reasoning and the replacement are recorded at the end of this task; implement
> the amendment, not the original snippet. The original is kept so the mistake
> stays legible.

**Files:**
- Modify: `logicals-site/client/styles/play.css`
- Modify: `logicals-site/client/styles/screens.css`
- Modify: `logicals-site/e2e/overview-canvas.spec.ts`

- [ ] **Step 1: Take the play-screen text out of flow**

In `play.css`, replace the `#play-status` rules:

```css
/*
 * Text that comes and goes never participates in layout.
 *
 * #play-status is empty until Pruefen has something to say. As an in-flow
 * element that made the stage reflow by a line the moment it appeared, the
 * ResizeObserver fire, and the refit discard whatever the player had zoomed to.
 * The refit preserves zoom now, but the reflow should not happen at all - and
 * for anyone who relies on the screen holding still, it is the reflow itself
 * that is the problem.
 */
.play-head { position: relative; }
#play-status,
.duel-progress {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    margin: 0;
    pointer-events: none;
}
.duel-progress { top: calc(100% + 1.4em); }
#play-status:empty,
.duel-progress[hidden] { display: none; }
```

- [ ] **Step 2: Do the same on the start screen**

In `screens.css`, replace the `.start-hint` rule:

```css
.start-actions { position: relative; }
.start-hint {
    position: absolute;
    left: 0;
    right: 0;
    top: 100%;
    margin: var(--space-2) 0 0;
    text-align: center;
}
.start-hint:empty { display: none; }
```

#### Amendment: what actually works

Two faults surfaced on the first run.

**Absolute positioning covers the grid.** `.play-head` sits directly on top of
`.play-stage`, so a line anchored at its `top: 100%` lands over the canvas's
column headers. That trades a reflow for something worse.

**Reserving a line is not enough either.** The message after Prüfen reads
"... rot hervorgehoben. Die Hervorhebung verschwindet, sobald du weiterspielst.",
which wraps to two lines at 375px. Any fixed reservation is sometimes wrong, and
the first attempt was off by exactly 1.40625px - `min-height: 1.4em` against an
inherited `line-height: 1.5` - which is too small to see and large enough to fire
the ResizeObserver.

So `#play-status` **moves out of `.play-head` into `.play-stage`** and becomes an
overlay pinned above the peeking clue sheet. It cannot resize anything, it is
clear of the headers along the top edge, and it is `pointer-events: none` so it
never swallows a tap. Moving it also fixes a quieter fault: landscape hides
`.play-head` outright, so a Prüfen message was invisible there.

`#duel-progress` stays in the head. It is always one short line, so reserving it
works - provided `line-height` and `min-height` are the same number. It is held
in flow for the whole duel and hidden outright in solo, where it never appears
and therefore never reflows; `playController.js` sets that on open rather than
toggling `hidden` when the first report lands mid-game.

The `--sheet-peek` custom property on `.play-stage` exists so the padding and the
overlay's offset cannot drift apart.

**Deliberate deviation from spec §5.** The spec lists `#resume-detail` alongside the
others. It is left in flow, and `#daily-detail` joins it there. Both are captions belonging
to the button directly above them, and both appear and disappear *with* that button - so
taking them out of flow would not prevent a reflow, it would only detach a caption from the
thing it captions and drop it at the foot of the stack. The rule is about text that comes
and goes while everything around it stays; these do not qualify.

- [ ] **Step 3: Write the test that would have caught the original bug**

Append to `e2e/overview-canvas.spec.ts`:

```ts
test('showing and clearing the status line does not resize the grid', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  const gridHeight = () => page.evaluate(() =>
    document.getElementById('overview-viewport')!.getBoundingClientRect().height);

  const before = await gridHeight();
  await page.evaluate(() => { document.getElementById('play-status')!.textContent = 'Eine Meldung'; });
  await page.waitForTimeout(150);
  expect(await gridHeight()).toBeCloseTo(before, 1);

  await page.evaluate(() => { document.getElementById('play-status')!.textContent = ''; });
  await page.waitForTimeout(150);
  expect(await gridHeight()).toBeCloseTo(before, 1);
});
```

- [ ] **Step 4: Verify**

Run: `cd logicals-site && npm run build && npx playwright test --reporter=line`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/styles logicals-site/e2e/overview-canvas.spec.ts
git commit -m "fix(ui): keep volatile text out of the layout"
```

---

### Task 6: The options screen loses its print fields

**Files:**
- Modify: `logicals-site/client/index.html`
- Modify: `logicals-site/client/js/screens/configScreen.js`
- Modify: `logicals-site/client/js/main.js`
- Modify: `logicals-site/e2e/{solo,duel,ios-layout,overview-canvas,play-sprint}.spec.ts`

- [ ] **Step 1: Remove the fields from the form**

In `index.html`, delete the `#field-puzzleCount` row from the `Rätsel` group, and delete
the entire `Darstellung` group — the `<section class="group">` containing
`#caption-design`, `#field-title`, `#field-subtitle`, `#field-palette`, `#field-accent`,
`#field-secondary` and `#field-ink`.

- [ ] **Step 2: Make the removed values constants**

In `configScreen.js`, replace the body of `collectOptions` with:

```js
export function collectOptions() {
    return {
        // One puzzle: playing means playing a puzzle, not producing a booklet.
        // The remaining print values are kept as constants so the generator
        // contract is untouched and a later PDF path can set them again.
        puzzleCount: 1,
        categoryCount: Number(el('field-categoryCount').value),
        valuesPerCategory: Number(el('field-valuesPerCategory').value),
        themeId: el('field-themeId').value,
        difficulty: el('field-difficulty').value,
        targetCategoryIndex: Number(el('field-targetCategoryIndex').value),
        seed: Number(el('field-seed').value.trim() || randomSeed()),
        colors: { ...PALETTES.klassik },
    };
}
```

Delete `applyPalette` and the `fillRange` call for `field-puzzleCount` from `loadOptions`,
and keep `PALETTES` — `collectOptions` now uses it.

- [ ] **Step 3: Drop the palette listener**

In `main.js`, remove:

```js
    el('field-palette').addEventListener('change', event => applyPalette(event.target.value));
```

and remove `applyPalette` from the import list.

- [ ] **Step 4: Update the e2e helpers**

Delete every `await ...locator('#field-puzzleCount').selectOption('1');` line from
`solo.spec.ts`, `duel.spec.ts`, `overview-canvas.spec.ts` and `play-sprint.spec.ts` — one
each.

In `ios-layout.spec.ts`, the first select is used to check that focused controls keep their
border radius. Point it at a select that still exists:

```ts
    const firstSelect = page.locator('#field-categoryCount');
```

- [ ] **Step 5: Verify**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test && npm run build && npx playwright test --reporter=line`
Expected: PASS. `player-ui.test.ts` asserts on `index.html` text; if it fails, it is
asserting on something being removed and the assertion needs updating, not the markup.

- [ ] **Step 6: Commit**

```bash
git add -A logicals-site
git commit -m "feat(config): drop the options that do not affect playing"
```

---

### Task 7: Two preferences and reduced motion

**Files:**
- Modify: `logicals-site/client/js/play/playPrefs.js`
- Modify: `logicals-site/client/js/screens/configScreen.js`
- Modify: `logicals-site/client/js/play/playController.js`
- Modify: `logicals-site/client/js/main.js`
- Modify: `logicals-site/client/index.html`, `client/styles/base.css`

**Interfaces:**
- Consumes: `loadPrefs`, `savePrefs`.
- Produces: `hideClock` and `hideDuel` on the preferences object, both `false` by default.

- [ ] **Step 1: Add the preferences**

In `playPrefs.js`, extend `DEFAULTS` and the parser:

```js
const DEFAULTS = {
    autoCross: true,
    /**
     * Visible time pressure is a barrier rather than a feature for a good number
     * of players. The clock keeps running and results still record it; it is
     * simply not shown.
     */
    hideClock: false,
    /** Removes the competitive parts for anyone who does not want them. */
    hideDuel: false,
};
```

```js
        return {
            autoCross: typeof saved.autoCross === 'boolean' ? saved.autoCross : DEFAULTS.autoCross,
            hideClock: typeof saved.hideClock === 'boolean' ? saved.hideClock : DEFAULTS.hideClock,
            hideDuel: typeof saved.hideDuel === 'boolean' ? saved.hideDuel : DEFAULTS.hideDuel,
        };
```

- [ ] **Step 2: Add the switches**

In `index.html`, inside the `Beim Spielen` group, after the `#field-autoCross` row:

```html
                    <label class="row">
                        <span class="row__label">Uhr ausblenden</span>
                        <input class="row__switch" type="checkbox" id="field-hideClock" />
                    </label>
                    <label class="row">
                        <span class="row__label">Duell-Funktionen ausblenden</span>
                        <input class="row__switch" type="checkbox" id="field-hideDuel" />
                    </label>
```

- [ ] **Step 3: Load and save them**

In `configScreen.js`, replace the `autoCross` wiring with a loop:

```js
    // Play-time preferences are not booklet options: they are never sent to the
    // generator, and they outlive the puzzle chosen here.
    const prefs = loadPrefs();
    for (const key of ['autoCross', 'hideClock', 'hideDuel']) {
        const field = el(`field-${key}`);
        field.checked = prefs[key];
        field.addEventListener('change', () => savePrefs({
            ...loadPrefs(), [key]: field.checked,
        }));
    }
```

- [ ] **Step 4: Honour them**

In `playController.js`, inside `openPlay`, after the title is set:

```js
    // The clock keeps running and the result still records the time; hiding it
    // only removes the pressure of watching it.
    el('play-timer').hidden = loadPrefs().hideClock;
```

In `main.js`, inside `refreshStartScreen`:

```js
    el('duel-join-button').hidden = loadPrefs().hideDuel;
```

and add `loadPrefs` to the imports from `./play/playPrefs.js`.

- [ ] **Step 5: Respect reduced motion**

Append to `base.css`:

```css
/*
 * Motion is decoration here - nothing in this app communicates through it - so
 * a stated preference against it costs nothing to honour completely.
 */
@media (prefers-reduced-motion: reduce) {
    *,
    *::before,
    *::after {
        animation-duration: 0.01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.01ms !important;
        scroll-behavior: auto !important;
    }
}
```

- [ ] **Step 6: Prove the switches do what they say**

Append to `e2e/daily-and-stats.spec.ts`:

```ts
test('hiding the clock keeps recording the time', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.addInitScript(() => localStorage.setItem(
    'logicals.prefs.v1', JSON.stringify({ autoCross: true, hideClock: true, hideDuel: false }),
  ));
  await page.goto('/');
  await page.locator('#daily-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });

  await expect(page.locator('#play-timer')).toBeHidden();
  // Still running underneath: the result must not lose its time.
  await page.waitForTimeout(1500);
  const elapsed = await page.locator('#play-timer').textContent();
  expect(elapsed).not.toBe('0:00');
});

test('hiding the duel removes it from the start screen', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.addInitScript(() => localStorage.setItem(
    'logicals.prefs.v1', JSON.stringify({ autoCross: true, hideClock: false, hideDuel: true }),
  ));
  await page.goto('/');
  await expect(page.locator('#duel-join-button')).toBeHidden();
});
```

- [ ] **Step 7: Verify**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test && npm run build && npx playwright test --reporter=line`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A logicals-site
git commit -m "feat(play): let the clock and the duel be hidden, and honour reduced motion"
```

---

# Phase 3 — Statistics

### Task 8: The calculations

**Files:**
- Create: `logicals-site/client/js/stats/statistics.js`
- Test: `logicals-site/test/statistics.test.ts`

**Interfaces:**
- Consumes: `dailyStreak`, `isDailyResult` from Task 2.
- Produces:
  - `median(values) -> number | null`
  - `personalStats(results, today) -> { total, byDifficulty, failedChecksTrend, streak, totalMs, best, longest }`
    where `byDifficulty` is `Array<{ difficulty, solved, medianMs }>` and
    `failedChecksTrend` is `{ earlier, later } | null`
  - `headToHead(results) -> Array<{ opponent, won, lost, drawn, averageMarginMs, fasterAt, recent }>`

- [ ] **Step 1: Write the failing test**

```ts
// logicals-site/test/statistics.test.ts
import { describe, expect, it } from 'vitest';
import { headToHead, median, personalStats } from '../client/js/stats/statistics';

const solo = (difficulty: string, elapsedMs: number, failedChecks: number, completedAt: string) => ({
  roomId: null, difficulty, elapsedMs, failedChecks, completedAt, seed: 1,
  configuration: { categoryCount: 5, valuesPerCategory: 5 },
  opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
});

const duel = (opponent: string, mine: number, theirs: number, difficulty = 'mittel') => ({
  roomId: 1, difficulty, elapsedMs: mine, failedChecks: 0,
  completedAt: '2026-09-18T12:00:00.000Z', seed: 1,
  configuration: { categoryCount: 5, valuesPerCategory: 5 },
  opponentName: opponent, opponentElapsedMs: theirs, opponentFailedChecks: 0,
});

describe('median', () => {
  it('takes the middle of an odd count', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('averages the two middles of an even count', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('is null with nothing to average', () => {
    expect(median([])).toBeNull();
  });

  it('is not dragged by one abandoned evening, unlike a mean', () => {
    const times = [300, 320, 310, 330, 20_000];
    expect(median(times)).toBe(320);
    // The mean would be over 4000 - which describes nobody's experience.
    expect(median(times)).toBeLessThan(1000);
  });
});

describe('personal statistics', () => {
  const results = [
    solo('leicht', 240_000, 0, '2026-09-18T12:00:00.000Z'),
    solo('leicht', 260_000, 2, '2026-09-17T12:00:00.000Z'),
    solo('mittel', 520_000, 3, '2026-09-16T12:00:00.000Z'),
    solo('schwer', 900_000, 5, '2026-09-15T12:00:00.000Z'),
  ];

  it('counts and medians per difficulty', () => {
    const stats = personalStats(results, '2026-09-18');
    const leicht = stats.byDifficulty.find(entry => entry.difficulty === 'leicht')!;
    expect(leicht.solved).toBe(2);
    expect(leicht.medianMs).toBe(250_000);
  });

  it('orders difficulties the way the settings screen does', () => {
    const stats = personalStats(results, '2026-09-18');
    expect(stats.byDifficulty.map(entry => entry.difficulty)).toEqual(['leicht', 'mittel', 'schwer']);
  });

  it('omits a difficulty that has never been played', () => {
    const stats = personalStats([solo('mittel', 1000, 0, '2026-09-18T12:00:00.000Z')], '2026-09-18');
    expect(stats.byDifficulty.map(entry => entry.difficulty)).toEqual(['mittel']);
  });

  it('compares the older half of the history against the newer', () => {
    const stats = personalStats(results, '2026-09-18');
    // Newest first, so the later half is the two most recent.
    expect(stats.failedChecksTrend).toEqual({ later: 1, earlier: 4 });
  });

  it('has no trend to report from a single result', () => {
    const stats = personalStats([results[0]], '2026-09-18');
    expect(stats.failedChecksTrend).toBeNull();
  });

  it('reports the totals worth keeping', () => {
    const stats = personalStats(results, '2026-09-18');
    expect(stats.total).toBe(4);
    expect(stats.totalMs).toBe(1_920_000);
    expect(stats.best?.elapsedMs).toBe(240_000);
    expect(stats.longest?.elapsedMs).toBe(900_000);
  });

  it('survives an empty history without pretending', () => {
    const stats = personalStats([], '2026-09-18');
    expect(stats.total).toBe(0);
    expect(stats.byDifficulty).toEqual([]);
    expect(stats.best).toBeNull();
    expect(stats.failedChecksTrend).toBeNull();
    expect(stats.streak).toBe(0);
  });
});

describe('head to head', () => {
  it('records wins, losses and draws per opponent', () => {
    const stats = headToHead([
      duel('Bo', 60_000, 75_000),
      duel('Bo', 80_000, 70_000),
      duel('Bo', 50_000, 50_000),
      duel('Lea', 90_000, 60_000),
    ]);
    const bo = stats.find(entry => entry.opponent === 'Bo')!;
    expect([bo.won, bo.lost, bo.drawn]).toEqual([1, 1, 1]);
    const lea = stats.find(entry => entry.opponent === 'Lea')!;
    expect([lea.won, lea.lost, lea.drawn]).toEqual([0, 1, 0]);
  });

  it('signs the average margin so ahead and behind read differently', () => {
    const [bo] = headToHead([duel('Bo', 60_000, 75_000), duel('Bo', 70_000, 75_000)]);
    // 15s and 5s ahead: positive means faster.
    expect(bo.averageMarginMs).toBe(10_000);

    const [lea] = headToHead([duel('Lea', 90_000, 60_000)]);
    expect(lea.averageMarginMs).toBe(-30_000);
  });

  it('says which difficulty each side is faster at', () => {
    const [bo] = headToHead([
      duel('Bo', 40_000, 60_000, 'leicht'),
      duel('Bo', 90_000, 60_000, 'schwer'),
    ]);
    expect(bo.fasterAt).toEqual({ leicht: 'me', schwer: 'them' });
  });

  it('keeps the last five as a strip, newest first', () => {
    const many = Array.from({ length: 7 }, (_, index) => duel('Bo', index * 1000, 3500));
    const [bo] = headToHead(many);
    expect(bo.recent).toHaveLength(5);
    expect(bo.recent[0]).toBe('won');      // 0ms beats 3500ms
  });

  it('ignores duels the opponent has not finished', () => {
    const unfinished = { ...duel('Bo', 60_000, 0), opponentName: null, opponentElapsedMs: null };
    expect(headToHead([unfinished])).toEqual([]);
  });

  it('ignores solo results entirely', () => {
    expect(headToHead([solo('leicht', 1000, 0, '2026-09-18T12:00:00.000Z')])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/statistics.test.ts`
Expected: FAIL — cannot resolve `../client/js/stats/statistics`.

- [ ] **Step 3: Write the implementation**

```js
// logicals-site/client/js/stats/statistics.js
/**
 * Everything the statistics screen shows, as pure functions over result rows.
 *
 * No DOM and no network, so the arithmetic is testable in the same node
 * environment as the rest of the suite - and the screen stays a renderer.
 */

import { dailyStreak } from '../play/dailyPuzzle.js';

const DIFFICULTY_ORDER = ['leicht', 'mittel', 'schwer'];

/**
 * The middle value, not the mean.
 *
 * One evening where somebody wandered off mid-puzzle drags a mean somewhere
 * that describes nobody's experience. The median ignores it.
 */
export function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
    if (!values.length) return null;
    return values.reduce((total, value) => total + value, 0) / values.length;
}

export function personalStats(results, today) {
    const byDifficulty = DIFFICULTY_ORDER
        .map(difficulty => {
            const matching = results.filter(result => result.difficulty === difficulty);
            return {
                difficulty,
                solved: matching.length,
                medianMs: median(matching.map(result => result.elapsedMs)),
            };
        })
        .filter(entry => entry.solved > 0);

    // Rows arrive newest first. Split in half and compare, which is enough to
    // say "getting better" without pretending to a regression line.
    let failedChecksTrend = null;
    if (results.length >= 2) {
        const half = Math.floor(results.length / 2);
        failedChecksTrend = {
            later: mean(results.slice(0, half).map(result => result.failedChecks)),
            earlier: mean(results.slice(half).map(result => result.failedChecks)),
        };
    }

    const byTime = [...results].sort((left, right) => left.elapsedMs - right.elapsedMs);
    return {
        total: results.length,
        byDifficulty,
        failedChecksTrend,
        streak: dailyStreak(results, today),
        totalMs: results.reduce((total, result) => total + result.elapsedMs, 0),
        best: byTime[0] ?? null,
        longest: byTime[byTime.length - 1] ?? null,
    };
}

export function headToHead(results) {
    const byOpponent = new Map();

    for (const result of results) {
        // A duel the other side has not finished has nothing to compare.
        if (!result.roomId || !result.opponentName) continue;
        if (typeof result.opponentElapsedMs !== 'number') continue;

        if (!byOpponent.has(result.opponentName)) {
            byOpponent.set(result.opponentName, {
                opponent: result.opponentName,
                won: 0, lost: 0, drawn: 0,
                margins: [], byDifficulty: new Map(), recent: [],
            });
        }
        const entry = byOpponent.get(result.opponentName);
        const margin = result.opponentElapsedMs - result.elapsedMs;
        const outcome = margin > 0 ? 'won' : margin < 0 ? 'lost' : 'drawn';

        entry[outcome]++;
        entry.margins.push(margin);
        if (entry.recent.length < 5) entry.recent.push(outcome);

        const difficulty = entry.byDifficulty.get(result.difficulty) ?? { mine: [], theirs: [] };
        difficulty.mine.push(result.elapsedMs);
        difficulty.theirs.push(result.opponentElapsedMs);
        entry.byDifficulty.set(result.difficulty, difficulty);
    }

    return [...byOpponent.values()].map(entry => ({
        opponent: entry.opponent,
        won: entry.won,
        lost: entry.lost,
        drawn: entry.drawn,
        // Positive means faster than them.
        averageMarginMs: mean(entry.margins),
        fasterAt: Object.fromEntries([...entry.byDifficulty].map(([difficulty, times]) => [
            difficulty,
            median(times.mine) <= median(times.theirs) ? 'me' : 'them',
        ])),
        recent: entry.recent,
    }));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd logicals-site && npx vitest run --root . test/statistics.test.ts`
Expected: PASS, 17 tests.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/js/stats/statistics.js logicals-site/test/statistics.test.ts
git commit -m "feat(stats): compute personal and head-to-head figures"
```

---

### Task 9: The statistics screen

**Files:**
- Create: `logicals-site/client/js/screens/statsScreen.js`
- Modify: `logicals-site/client/index.html`, `client/styles/screens.css`, `client/js/main.js`

- [ ] **Step 1: Add the screen**

In `index.html`, after `#screen-history`'s closing `</section>`:

```html
    <section class="screen screen--stats" id="screen-stats">
        <header class="bar">
            <button class="btn btn--ghost btn--small btn--icon" type="button" data-goto="screen-start" aria-label="Zurück">‹</button>
            <h2>Statistik</h2>
        </header>
        <p class="result-sub" id="stats-player"></p>
        <div id="stats-body"></div>
        <p class="hint" id="stats-hint"></p>
        <p class="stats-scope">Über die letzten 100 Rätsel.</p>
    </section>
```

- [ ] **Step 2: Write the renderer**

```js
// logicals-site/client/js/screens/statsScreen.js
/**
 * Renders what statistics.js computed. No arithmetic here.
 */

import { clear, el, make, setHint } from '../dom.js';
import { listPlayerResults } from '../players/playerApi.js';
import { headToHead, personalStats } from '../stats/statistics.js';
import { berlinDate } from '../play/dailyPuzzle.js';

function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.round(milliseconds / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatHours(milliseconds) {
    const minutes = Math.round(milliseconds / 60_000);
    return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60} min` : `${minutes} min`;
}

function statRow(label, value) {
    const row = make('div', { className: 'stats-row' });
    row.append(make('dt', { text: label }), make('dd', { text: value }));
    return row;
}

function personalSection(stats) {
    const section = make('section', { className: 'stats-section' });
    section.append(make('h3', { text: 'Deine Entwicklung' }));

    const list = make('dl', { className: 'stats-list' });
    for (const entry of stats.byDifficulty) {
        list.append(statRow(
            entry.difficulty,
            `${formatDuration(entry.medianMs)} · ${entry.solved} gelöst`,
        ));
    }

    if (stats.failedChecksTrend) {
        const { earlier, later } = stats.failedChecksTrend;
        const arrow = later < earlier ? '↓' : later > earlier ? '↑' : '→';
        list.append(statRow(
            'Fehlprüfungen',
            `${earlier.toFixed(1)} → ${later.toFixed(1)} ${arrow}`,
        ));
    }

    list.append(statRow('Serie', `${stats.streak} ${stats.streak === 1 ? 'Tag' : 'Tage'}`));
    list.append(statRow('Gesamtzeit', formatHours(stats.totalMs)));
    if (stats.best) list.append(statRow('Beste Zeit', formatDuration(stats.best.elapsedMs)));

    section.append(list);
    return section;
}

const OUTCOME_MARK = { won: '●', lost: '○', drawn: '◐' };

function duelSection(entry) {
    const section = make('section', { className: 'stats-section' });
    section.append(make('h3', { text: `Gegen ${entry.opponent}` }));

    const list = make('dl', { className: 'stats-list' });
    list.append(statRow('Bilanz', `${entry.won} – ${entry.lost} – ${entry.drawn}`));

    const margin = entry.averageMarginMs;
    list.append(statRow(
        margin >= 0 ? '⌀ Vorsprung' : '⌀ Rückstand',
        formatDuration(Math.abs(margin)),
    ));

    for (const [difficulty, who] of Object.entries(entry.fasterAt)) {
        list.append(statRow(
            difficulty,
            who === 'me' ? 'du bist schneller' : `${entry.opponent} ist schneller`,
        ));
    }

    section.append(list);
    section.append(make('p', {
        className: 'stats-strip',
        text: entry.recent.map(outcome => OUTCOME_MARK[outcome]).join(' '),
    }));
    return section;
}

export async function loadStatsScreen(player) {
    el('stats-player').textContent = `Statistik von ${player.displayName}`;
    const body = clear(el('stats-body'));
    setHint('stats-hint', 'Wird berechnet …');

    try {
        // As in main.js: 100 is the Worker's hard ceiling - it answers 400 above
        // that rather than clamping - and the screen says so at the bottom.
        const results = await listPlayerResults(player.id, 100);
        if (!results.length) {
            setHint('stats-hint', 'Noch keine abgeschlossenen Rätsel.');
            return;
        }
        setHint('stats-hint', '');
        body.append(personalSection(personalStats(results, berlinDate())));
        for (const entry of headToHead(results)) body.append(duelSection(entry));
    } catch (error) {
        setHint('stats-hint', error.message, true);
    }
}
```

- [ ] **Step 3: Style it**

Append to `screens.css`:

```css
.stats-section { margin-bottom: var(--space-5); }
.stats-section h3 {
    margin: 0 0 var(--space-2);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: .08em;
    text-transform: uppercase;
    color: var(--teal);
}
.stats-list { margin: 0; }
.stats-row {
    display: flex;
    justify-content: space-between;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-bottom: var(--hairline) solid var(--line);
}
.stats-row dt { color: var(--muted); }
.stats-row dd { margin: 0; font-weight: 600; font-variant-numeric: tabular-nums; }
.stats-strip { margin: var(--space-2) 0 0; letter-spacing: .3em; color: var(--muted); }
.stats-scope { margin-top: var(--space-5); font-size: 12px; color: var(--muted); }
```

- [ ] **Step 4: Wire the button**

In `main.js`, add the import and the listener:

```js
import { loadStatsScreen } from './screens/statsScreen.js';
```

```js
    el('stats-button').addEventListener('click', () => {
        const player = getSelectedPlayer();
        if (!player) return;
        showScreen('screen-stats');
        loadStatsScreen(player);
    });
```

- [ ] **Step 5: Verify**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test && npm run build`
Expected: all exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A logicals-site
git commit -m "feat(stats): add the statistics screen"
```

---

### Task 10: End-to-end proof, and the acceptance pass

**Files:**
- Modify: `logicals-site/e2e/daily-and-stats.spec.ts`

- [ ] **Step 1: Add the spec**

```ts
const STATS_HISTORY = [
  {
    id: 4, playerId: 1, roomId: 1, attemptKey: 'd', puzzleFingerprint: 'f',
    puzzleTitle: 'Duell', themeId: 'standard', difficulty: 'mittel', seed: 99,
    configuration: { categoryCount: 5, valuesPerCategory: 5 },
    elapsedMs: 60_000, failedChecks: 1, completedAt: '2026-09-18T12:00:00.000Z',
    opponentName: 'Bo', opponentElapsedMs: 75_000, opponentFailedChecks: 3,
  },
  {
    id: 3, playerId: 1, roomId: null, attemptKey: 'c', puzzleFingerprint: 'f',
    puzzleTitle: 'Solo', themeId: 'standard', difficulty: 'leicht', seed: 98,
    configuration: { categoryCount: 5, valuesPerCategory: 5 },
    elapsedMs: 240_000, failedChecks: 0, completedAt: '2026-09-17T12:00:00.000Z',
    opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
  },
  {
    id: 2, playerId: 1, roomId: null, attemptKey: 'b', puzzleFingerprint: 'f',
    puzzleTitle: 'Solo', themeId: 'standard', difficulty: 'leicht', seed: 97,
    configuration: { categoryCount: 5, valuesPerCategory: 5 },
    elapsedMs: 260_000, failedChecks: 4, completedAt: '2026-09-16T12:00:00.000Z',
    opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
  },
];

test('the statistics screen reports development and the head-to-head', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page, STATS_HISTORY);
  await page.goto('/');
  await page.locator('#stats-button').click();

  const body = page.locator('#stats-body');
  // Median of 240s and 260s, not the mean of a three-row history.
  await expect(body).toContainText('4:10');
  await expect(body).toContainText('Fehlprüfungen');
  await expect(body).toContainText('Serie');

  await expect(body).toContainText('Gegen Bo');
  await expect(body).toContainText('1 – 0 – 0');
  await expect(body).toContainText('0:15');      // 15s ahead
  // And it does not imply it covers everything.
  await expect(page.locator('.stats-scope')).toContainText('letzten 100');
});

test('an empty history says so instead of showing zeroes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page, []);
  await page.goto('/');
  await page.locator('#stats-button').click();
  await expect(page.locator('#stats-hint')).toContainText('Noch keine');
  await expect(page.locator('#stats-body')).toBeEmpty();
});
```

- [ ] **Step 2: Run everything**

```bash
cd /home/jonas/Documents/Code/-german-logic-puzzle-generator
npx jest && npx tsc --noEmit
cd logicals-site
npx tsc --noEmit && npx vitest run --root . test && npm run build
npx playwright test --reporter=line
```

Expected: 162 generator tests, both typechecks, the build, every site unit test, and every
Playwright scenario green.

- [ ] **Step 3: Capture acceptance screenshots**

Write a throwaway script that captures the start screen (with and without a solved daily),
the statistics screen, and the slimmed settings screen, on an iPhone 13 mini in both
themes. Delete the script afterwards so the tree stays clean.

- [ ] **Step 4: Confirm the tree and push**

```bash
cd /home/jonas/Documents/Code/-german-logic-puzzle-generator
git status --short     # must be empty
git push
```

- [ ] **Step 5: Stop**

Do not update the ChatGPT Site. Publishing is a separate step and needs explicit approval.

---

## Self-Review

**Spec coverage.** §3.1 derivation → Tasks 1–2. §3.2 rotation → Task 2. §3.3 state without a
table → Task 2 (`isDailyResult`, `dailyStreak`) and Task 3 (display). §3.4 resume → nothing
to build; the daily is an ordinary solo game, asserted implicitly by Task 4. §4.1 start
screen → Task 3. §4.2 options screen → Task 6. §5 layout stability → Task 5; reduced
motion, clock and duel → Task 7. §6 statistics → Tasks 8–9, limit note in Task 9 Step 1.
Acceptance 1 → Task 4; 2 → Task 4 (two timezones); 3 → Tasks 2 and 4; 4 → Task 4; 5 →
Task 6; 6 → Task 5; 7 → Task 7; 8 → Task 7; 9 → Task 10; 10 → Task 10 Step 2.

**Placeholder scan.** No TBDs, no "handle edge cases", no "similar to Task N". Task 10
Step 3 describes a throwaway script rather than showing it, which is acceptable: it
produces no committed artefact.

**Type consistency.** `fnv1a` returns a number and `fnv1a36` a string, used that way in
Tasks 1 and 2. `berlinDate`, `dailySeed`, `dailyDifficulty`, `dailyStreak` and
`isDailyResult` keep their signatures across Tasks 2, 3, 8 and 9. `personalStats(results,
today)` and `headToHead(results)` match between Tasks 8 and 9. `median` returns
`number | null`, and Task 9 only formats it for difficulties that have at least one solved
puzzle, so it is never null there.

**Deviations, stated rather than hidden.** Spec §5 lists `#resume-detail` among the
elements to take out of flow; Task 5 leaves it and `#daily-detail` in flow, with the
reasoning recorded at the point of the decision. Everything else in the spec is implemented
as written.

**One risk worth naming.** Task 2's `berlinDate` tests assume CEST in September and CET in
January. Those are fixed historical facts for 2026 under current German law, but if the EU
abolishes the seasonal clock change before then the January assertion would need revisiting
— it would fail loudly rather than silently, which is the right failure.

**Ordering constraint.** Task 1 must land before Task 2: the daily seed needs the numeric
hash. Task 2 before Tasks 3, 8 and 9. Task 6 changes shared e2e helpers, so it should not
be interleaved with other e2e work.
