# Play Sprint Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add resume, a note mark, opponent progress in duels, and contradiction detection — in that order.

**Architecture:** Resume regenerates the puzzle from its stored configuration and verifies it by fingerprint, reusing the path the duel already proves. The note mark is a third value that the scoring logic ignores by construction, and landing it forces the pager onto the same armed-tool model the overview uses. Opponent progress is a count, carried by a new nullable pair of columns and a slow loop of its own, because duel polling stops when play starts. Contradiction detection is a pure function over the player's own marks.

**Tech Stack:** Vanilla ES modules, Canvas 2D, Vitest 4 (node, no DOM), Playwright 1.55, Cloudflare Worker, D1 via Drizzle.

**Spec:** `docs/superpowers/specs/2026-09-18-play-sprint-design.md`

## Global Constraints

- Base branch `redesign/mobile-canvas-overview` at `c4dddf9`.
- Do not change the generator (`src/`), result scoring, result attribution, or the duel start protocol.
- The Vitest environment is **node with no DOM**. Unit tests cover pure modules; anything touching the DOM is covered by Playwright.
- `npm ci --ignore-scripts` in `logicals-site/` — plain `npm ci` fails on `sharp` under Node 25.
- Commit messages contain only the message: no `Co-Authored-By`, no tool footer, no emoji.
- Do not touch the ChatGPT Site. Deployment is a separate step requiring explicit approval.
- Every task ends green on: `npx vitest run --root . test`, `npx tsc --noEmit`, `npm run build`.
- The full Playwright suite must pass before any task that changes the Worker or the schema is committed.
- Notes never participate in solving, checking, or derived crosses.
- The opponent's progress is a count. No cell keys ever cross the wire.

---

## File Structure

**Create**
- `logicals-site/client/js/play/resumeStore.js` — the resume record: read, write, clear. Pure apart from `localStorage`.
- `logicals-site/client/js/duel/progressReporter.js` — throttled reporting and the slow poll during duel play.
- `logicals-site/test/resume-store.test.ts`
- `logicals-site/test/play-contradictions.test.ts`
- `logicals-site/e2e/play-sprint.spec.ts`

**Modify**
- `logicals-site/client/js/play/playState.js` — `maybe` in `MARK_SYMBOLS`; resume record written from `save()`'s caller, not from here.
- `logicals-site/client/playLogic.js` — `findContradictions`.
- `logicals-site/client/js/play/playController.js` — resume bookkeeping, shared tool, contradiction painting, duel progress wiring.
- `logicals-site/client/js/play/matrixView.js` — the pager stops cycling on tap and reports activation instead.
- `logicals-site/client/js/play/overview/overviewCanvas.js` — the tool moves out into a shared module's state.
- `logicals-site/client/js/play/overview/renderer.js` — draw `maybe`, draw contradictions.
- `logicals-site/client/index.html` — resume button, note tool button, contradiction status line.
- `logicals-site/client/styles/*.css` — the above.
- `logicals-site/client/js/main.js` — wire the resume button.
- `logicals-site/worker/index.ts`, `worker/services/rooms.ts`, `worker/repositories/rooms.ts`, `db/schema.ts` — progress route and column.
- `logicals-site/client/js/duel/roomApi.js` — `reportDuelProgress`.

---

# Phase 1 — Weiterspielen

### Task 1: The resume record

**Files:**
- Create: `logicals-site/client/js/play/resumeStore.js`
- Test: `logicals-site/test/resume-store.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `RESUME_KEY = 'logicals.resume.v1'`
  - `saveResume(record) -> void` where `record` is
    `{ options, puzzleIndex, fingerprint, storageKey, playerId, title, savedAt, elapsedMs, markCount }`
  - `loadResume(playerId) -> record | null` — returns `null` for another player's record, for a malformed one, and when storage is unavailable.
  - `clearResume() -> void`

- [ ] **Step 1: Write the failing test**

```ts
// logicals-site/test/resume-store.test.ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/resume-store.test.ts`
Expected: FAIL — cannot resolve `../client/js/play/resumeStore`.

- [ ] **Step 3: Write the implementation**

```js
// logicals-site/client/js/play/resumeStore.js
/**
 * The one unfinished solo game, remembered well enough to rebuild it.
 *
 * Puzzles are generated at runtime and never stored, so resuming means
 * regenerating - which is exactly what the duel already does with a room's
 * configuration and puzzle index, verifying the result by fingerprint before
 * trusting it. This record carries the same ingredients for a solo game.
 *
 * One slot, not a list. Finished games live in the history screen; this is for
 * the game you were in the middle of, and a list would need management UI for a
 * situation that hardly arises.
 */

export const RESUME_KEY = 'logicals.resume.v1';

/** Everything that must be present for a resume to even be attempted. */
const REQUIRED = ['options', 'puzzleIndex', 'fingerprint', 'storageKey', 'playerId'];

export function saveResume(record) {
    try {
        localStorage.setItem(RESUME_KEY, JSON.stringify(record));
    } catch { /* private mode or full storage - playing on is more important */ }
}

export function loadResume(playerId) {
    try {
        const raw = localStorage.getItem(RESUME_KEY);
        if (!raw) return null;
        const record = JSON.parse(raw);
        if (REQUIRED.some(field => record?.[field] === undefined || record[field] === null)) {
            return null;
        }
        // Another player's game would be filed under the wrong name on completion.
        if (record.playerId !== playerId) return null;
        return record;
    } catch {
        return null;
    }
}

export function clearResume() {
    try {
        localStorage.removeItem(RESUME_KEY);
    } catch { /* nothing to do and nothing worth breaking play over */ }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd logicals-site && npx vitest run --root . test/resume-store.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/js/play/resumeStore.js logicals-site/test/resume-store.test.ts
git commit -m "feat(play): remember the one unfinished solo game"
```

---

### Task 2: Keep the record current

**Files:**
- Modify: `logicals-site/client/js/play/playController.js`

**Interfaces:**
- Consumes: `saveResume`, `clearResume` from Task 1; `fingerprintPuzzle` from `../generation/canonicalPuzzle.ts`.
- Produces: a resume record that tracks the live solo game.

- [ ] **Step 1: Import and add the bookkeeping**

Add to the imports:

```js
import { fingerprintPuzzle } from '../generation/canonicalPuzzle.ts';
import { clearResume, saveResume } from './resumeStore.js';
```

Add next to the other module-level state:

```js
/** Computed once per puzzle; the resume record needs it and it is not cheap. */
let puzzleFingerprint = null;
```

- [ ] **Step 2: Write the record from persist()**

Replace `persist`:

```js
function persist() {
    const elapsedMs = timer ? timer.elapsedMs() : 0;
    save(state, elapsedMs);
    rememberForResume(elapsedMs);
}

/**
 * Keeps the resume record in step with the live game.
 *
 * Solo only: a duel has its own session store, its own expiry, and a room that
 * may be gone by the time anyone comes back. And a solved or empty grid is not
 * something to come back TO, so both clear the record rather than offering a
 * button that leads nowhere interesting.
 */
function rememberForResume(elapsedMs) {
    if (state.context?.mode !== 'solo' || !state.context?.player) return;
    if (state.solved || state.marks.size === 0 || !puzzleFingerprint) {
        clearResume();
        return;
    }
    saveResume({
        options: state.context.options,
        puzzleIndex: state.context.puzzleIndex ?? 0,
        fingerprint: puzzleFingerprint,
        storageKey: state.storageKey,
        playerId: state.context.player.id,
        title: `${state.puzzle.number}. ${state.puzzle.title}`,
        savedAt: new Date().toISOString(),
        elapsedMs,
        markCount: state.marks.size,
    });
}
```

- [ ] **Step 3: Compute the fingerprint when a puzzle opens**

In `openPlay`, immediately after `state.truth = buildTruthSet(puzzle);`:

```js
    // Asynchronous, and only the resume record needs it, so the game does not
    // wait for it. Until it lands, rememberForResume simply skips.
    puzzleFingerprint = null;
    fingerprintPuzzle(puzzle)
        .then(value => { puzzleFingerprint = value; })
        .catch(() => { puzzleFingerprint = null; });
```

- [ ] **Step 4: Verify**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test && npm run build`
Expected: all exit 0.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/js/play/playController.js
git commit -m "feat(play): keep the resume record in step with the live game"
```

---

### Task 3: Offer and perform the resume

**Files:**
- Modify: `logicals-site/client/index.html`
- Modify: `logicals-site/client/js/main.js`
- Modify: `logicals-site/client/styles/screens.css`

**Interfaces:**
- Consumes: `loadResume`, `clearResume` from Task 1; `fetchBooklet` from `./api.js`; `fingerprintPuzzle`; `openPlay`.
- Produces: a working `Weiterspielen` button on the start screen.

- [ ] **Step 1: Add the markup**

In `index.html`, inside `#screen-start`, immediately before `#start-button`:

```html
            <button class="btn btn--primary resume-button" type="button" id="resume-button" hidden>
                <span class="resume-button__label">Weiterspielen</span>
                <span class="resume-button__detail" id="resume-detail"></span>
            </button>
```

- [ ] **Step 2: Style it**

Append to `screens.css`:

```css
/* The resume button carries its own second line, so the player can tell which
   game they are about to go back into before they commit to it. */
.resume-button {
    display: grid;
    gap: 2px;
    text-align: left;
    padding: var(--space-3) var(--space-4);
}
.resume-button__label { font-weight: 600; }
.resume-button__detail { font-size: 13px; opacity: .85; }
.resume-button[hidden] { display: none; }
```

- [ ] **Step 3: Wire it**

In `main.js`, add the imports:

```js
import { clearResume, loadResume } from './play/resumeStore.js';
import { fingerprintPuzzle } from './generation/canonicalPuzzle.ts';
```

Add these functions:

```js
function describeResume(record) {
    const minutes = Math.floor(record.elapsedMs / 60_000);
    const seconds = Math.floor((record.elapsedMs % 60_000) / 1000);
    const clock = `${minutes}:${String(seconds).padStart(2, '0')}`;
    const marks = record.markCount === 1 ? '1 Markierung' : `${record.markCount} Markierungen`;
    return `${record.title} · ${clock} · ${marks}`;
}

function refreshResumeButton() {
    const button = el('resume-button');
    const player = getSelectedPlayer();
    const record = player ? loadResume(player.id) : null;
    button.hidden = !record;
    if (record) el('resume-detail').textContent = describeResume(record);
}

/**
 * Rebuilds the saved game and reopens it.
 *
 * The puzzle is regenerated rather than restored, because it was never stored -
 * the same route the duel takes from a room's configuration. The fingerprint is
 * the guard: if a future generator produced a different booklet from the same
 * configuration, the marks would land on the wrong cells, and refusing is far
 * better than silently corrupting a game.
 */
async function resumeSavedGame() {
    const player = getSelectedPlayer();
    const record = player ? loadResume(player.id) : null;
    if (!record) { refreshResumeButton(); return; }

    setBusy('Gespeichertes Rätsel wird wiederhergestellt …');
    try {
        const generated = await fetchBooklet(record.options);
        const puzzle = generated.booklet.puzzles[record.puzzleIndex];
        if (!puzzle) throw new Error('Das gespeicherte Rätsel gibt es nicht mehr.');
        if (await fingerprintPuzzle(puzzle) !== record.fingerprint) {
            throw new Error('Das gespeicherte Rätsel lässt sich nicht mehr identisch erzeugen.');
        }
        openPlay(puzzle, {
            mode: 'solo',
            player,
            options: record.options,
            puzzleIndex: record.puzzleIndex,
        });
    } catch (error) {
        // A button that leads nowhere is worse than no button.
        clearResume();
        refreshResumeButton();
        setHint('start-hint', error.message, true);
    } finally {
        clearBusy();
    }
}
```

In `wire()`, add:

```js
    el('resume-button').addEventListener('click', resumeSavedGame);
```

And at the end of `wire()`, plus after the player controller resolves:

```js
    refreshResumeButton();
```

In the bottom-of-file bootstrap, change:

```js
initPlayerController().then(() => { openRoomFromUrl(); refreshResumeButton(); });
```

- [ ] **Step 4: Confirm a hint target exists**

Run: `cd logicals-site && grep -n 'id="start-hint"' client/index.html`
Expected: one match. If there is none, add
`<p class="hint" id="start-hint" role="status" aria-live="polite"></p>`
directly after `#resume-button`.

- [ ] **Step 5: Pass the puzzle index through from generation**

In `main.js`'s `generate()`, change the solo `onPlay` callback so the index is carried:

```js
            onPlay: (puzzle, puzzleIndex) => openPlay(puzzle, {
                mode: 'solo',
                player: getSelectedPlayer(),
                options: state.options,
                puzzleIndex,
            }),
```

- [ ] **Step 6: Confirm the result screen supplies that index**

Run: `cd logicals-site && grep -n "onPlay" client/js/screens/resultScreen.js`
Expected: `onPlay` is called with the puzzle. If it is called with only one argument, change that call site to `onPlay(puzzle, index)`, matching how `onDuel(puzzle, puzzleIndex)` is already called in the same file.

- [ ] **Step 7: Verify**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test && npm run build`
Expected: all exit 0.

- [ ] **Step 8: Commit**

```bash
git add logicals-site/client/index.html logicals-site/client/js/main.js logicals-site/client/styles/screens.css
git commit -m "feat(play): offer Weiterspielen on the start screen"
```

---

### Task 4: End-to-end proof of resume

**Files:**
- Create: `logicals-site/e2e/play-sprint.spec.ts`

- [ ] **Step 1: Write the failing spec**

```ts
// logicals-site/e2e/play-sprint.spec.ts
import { expect, test, type Page } from '@playwright/test';

async function withPlayer(page: Page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  await page.route('**/api/players', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-18T00:00:00Z' }] }),
  }));
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
}

async function generateAndPlay(page: Page) {
  await page.locator('#start-button').click();
  await page.locator('#field-puzzleCount').selectOption('1');
  await page.locator('#field-categoryCount').selectOption('5');
  await page.locator('#field-valuesPerCategory').selectOption('5');
  await page.locator('#field-difficulty').selectOption('leicht');
  await page.locator('#generate-button').click();
  await expect(page.locator('.puzzle')).toHaveCount(1, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Spielen', exact: true }).click();
  await expect(page.locator('#overview-canvas')).toBeVisible();
  await page.waitForTimeout(350);
}

/** Taps a mirror cell by index, which drives the real hit path. */
async function tapCell(page: Page, index: number) {
  const cell = page.locator('.overview-mirror__cell').nth(index);
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return cell.getAttribute('data-key');
}

test('a game in progress can be resumed after a reload', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  const title = await page.locator('#play-title').textContent();
  const key = await tapCell(page, 0);
  await tapCell(page, 1);
  await page.waitForTimeout(150);

  await page.reload();
  const resume = page.locator('#resume-button');
  await expect(resume).toBeVisible();
  await expect(page.locator('#resume-detail')).toContainText('Markierungen');

  await resume.click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
  // The same puzzle, and the same marks on it.
  await expect(page.locator('#play-title')).toHaveText(title || '');
  const label = await page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(label).toContain('ausgeschlossen');
});

test('an empty grid offers nothing to resume', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.reload();
  await expect(page.locator('#resume-button')).toBeHidden();
});

test('a record that cannot be rebuilt is refused and cleared', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);
  await tapCell(page, 0);
  await page.waitForTimeout(150);

  // Corrupt the fingerprint: the regenerated puzzle will no longer match.
  await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('logicals.resume.v1')!);
    record.fingerprint = 'not-the-right-fingerprint';
    localStorage.setItem('logicals.resume.v1', JSON.stringify(record));
  });

  await page.reload();
  await page.locator('#resume-button').click();
  await expect(page.locator('#start-hint')).toContainText('identisch erzeugen', { timeout: 60_000 });
  // And it does not stay around to fail again.
  await expect(page.locator('#resume-button')).toBeHidden();
});
```

- [ ] **Step 2: Run it**

Run: `cd logicals-site && npx playwright test e2e/play-sprint.spec.ts --reporter=line`
Expected: PASS, 3 tests.

- [ ] **Step 3: Run the whole suite**

Run: `cd logicals-site && npx playwright test --reporter=line`
Expected: PASS. The existing 26 scenarios are untouched.

- [ ] **Step 4: Commit**

```bash
git add logicals-site/e2e/play-sprint.spec.ts
git commit -m "test(play): cover resume, including the refusal path"
```

---

# Phase 2 — Notiz-Markierung

### Task 5: A third mark that scoring ignores

**Files:**
- Modify: `logicals-site/client/js/play/playState.js`
- Test: `logicals-site/test/play-implications.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `MARK_SYMBOLS` gains `maybe: '·'`. `setMarkWith` accepts `'maybe'`.

- [ ] **Step 1: Write the failing test**

Append to `test/play-implications.test.ts`:

```ts
describe('the note mark', () => {
  it('is neither right nor wrong, and does not complete a solve', async () => {
    // playLogic tests explicitly for 'yes' and 'no', so a note falls through
    // both. That is the behaviour we want, and it is load-bearing enough to pin.
    const { buildTruthSet, evaluate } = await import('../client/playLogic.js') as any;
    const puzzle = {
      categories: [
        { label: 'A', values: ['a1', 'a2'] },
        { label: 'B', values: ['b1', 'b2'] },
      ],
      solutionRows: [{ A: 'a1', B: 'b1' }, { A: 'a2', B: 'b2' }],
    };
    const truth = buildTruthSet(puzzle);

    const marks = new Map([['0.1.0.0', 'maybe'], ['0.1.1.1', 'maybe']]);
    const result = evaluate(marks, truth);
    expect([...result.wrong]).toEqual([]);     // never counted as an error
    expect(result.solved).toBe(false);          // and never completes the grid
    expect(result.missing).toBe(2);
  });

  it('is left alone by the crosses a confirmation derives', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.0', 'maybe', V);
    setMarkWith(state, '0.1.2.3', 'yes', V);
    // Derived crosses only ever fill EMPTY cells, so the note survives...
    expect(state.marks.get('0.1.2.0')).toBe('maybe');
    setMarkWith(state, '0.1.2.3', null, V);
    // ...and is still there when the confirmation is withdrawn.
    expect(state.marks.get('0.1.2.0')).toBe('maybe');
  });

  it('is replaced by a confirmation placed on top of it', () => {
    const state = fresh();
    setMarkWith(state, '0.1.2.3', 'maybe', V);
    setMarkWith(state, '0.1.2.3', 'yes', V);
    expect(state.marks.get('0.1.2.3')).toBe('yes');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/play-implications.test.ts`
Expected: FAIL on the first case — `evaluate` is fine, but the import path or the note handling is not yet in place.

- [ ] **Step 3: Add the symbol**

In `playState.js`:

```js
export const MARK_SYMBOLS = { yes: '○', no: '×', maybe: '·' };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd logicals-site && npx vitest run --root . test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/js/play/playState.js logicals-site/test/play-implications.test.ts
git commit -m "feat(play): add a note mark that scoring ignores by construction"
```

---

### Task 6: One tool bar for both views

**Files:**
- Create: `logicals-site/client/js/play/markTool.js`
- Modify: `logicals-site/client/js/play/overview/overviewCanvas.js`
- Modify: `logicals-site/client/js/play/matrixView.js`
- Modify: `logicals-site/client/js/play/playController.js`
- Modify: `logicals-site/client/index.html`, `client/styles/play.css`
- Test: `logicals-site/test/mark-tool.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `createMarkTool({ buttons, onChange }) -> { current(): 'no'|'yes'|'maybe'|'clear'|null, setDisabled(bool), destroy() }`
  - `nextMark(current, tool) -> 'no'|'yes'|'maybe'|null` — pure; what a tap writes.

**Why this is in the sprint:** the pager still cycles on tap while the overview uses the
armed tool. A note mark makes that untenable — the pager could not place or clear one —
and a four-state cycle is worse than a three-state one. Both views now mark through the
same tool.

- [ ] **Step 1: Write the failing test**

```ts
// logicals-site/test/mark-tool.test.ts
import { describe, expect, it } from 'vitest';
import { nextMark } from '../client/js/play/markTool';

describe('what a tap writes', () => {
  it('writes the armed tool onto an empty cell', () => {
    expect(nextMark(undefined, 'no')).toBe('no');
    expect(nextMark(undefined, 'yes')).toBe('yes');
    expect(nextMark(undefined, 'maybe')).toBe('maybe');
  });

  it('clears when the armed tool is already what the cell holds', () => {
    // Every tool is a switch, so correcting costs one tap and never produces a
    // surprise third state.
    expect(nextMark('no', 'no')).toBeNull();
    expect(nextMark('yes', 'yes')).toBeNull();
    expect(nextMark('maybe', 'maybe')).toBeNull();
  });

  it('overwrites a different mark rather than clearing it', () => {
    expect(nextMark('no', 'yes')).toBe('yes');
    expect(nextMark('maybe', 'no')).toBe('no');
    expect(nextMark('yes', 'maybe')).toBe('maybe');
  });

  it('erases with the eraser, and does nothing to an empty cell', () => {
    expect(nextMark('yes', 'clear')).toBeNull();
    expect(nextMark(undefined, 'clear')).toBeNull();
  });

  it('writes nothing at all when no tool is armed', () => {
    expect(nextMark(undefined, null)).toBe(undefined);
    expect(nextMark('no', null)).toBe(undefined);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/mark-tool.test.ts`
Expected: FAIL — cannot resolve `../client/js/play/markTool`.

- [ ] **Step 3: Write the implementation**

```js
// logicals-site/client/js/play/markTool.js
/**
 * The armed marking tool, shared by both views.
 *
 * It used to live inside the overview while the pager cycled on tap. A note mark
 * made that split untenable - the pager could not place or clear one - and a
 * four-state cycle is worse than a three-state one. One tool, one behaviour,
 * whichever view you are looking at.
 */

/** Tool id -> the mark it writes. `clear` erases. */
const WRITES = { no: 'no', yes: 'yes', maybe: 'maybe', clear: null };

/**
 * What a tap on a cell should set.
 *
 * `undefined` means "leave the cell exactly as it is", which is how an unarmed
 * tool inspects without changing anything. `null` means "erase".
 */
export function nextMark(current, tool) {
    if (!tool) return undefined;
    const target = WRITES[tool];
    // Armed on the value the cell already holds, a tap takes it back off.
    return current === target && target !== null ? null : target;
}

export function createMarkTool({ buttons, onChange }) {
    /** Crosses dominate a solved grid four to one, so start on one. */
    let tool = 'no';
    let disabled = false;

    function render() {
        for (const button of buttons) {
            const active = !disabled && button.dataset.tool === tool;
            button.disabled = disabled;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-pressed', String(active));
        }
        onChange?.(tool);
    }

    const handlers = buttons.map(button => {
        const handler = () => {
            if (disabled) return;
            // Pressing the armed tool disarms it, which is the inspect mode.
            tool = button.dataset.tool === tool ? null : button.dataset.tool;
            render();
        };
        button.addEventListener('click', handler);
        return { button, handler };
    });

    render();

    return {
        current: () => tool,
        setDisabled(next) { disabled = next; render(); },
        destroy() {
            for (const { button, handler } of handlers) button.removeEventListener('click', handler);
        },
    };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd logicals-site && npx vitest run --root . test/mark-tool.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Add the note button to the markup**

In `index.html`, inside `.overview-marks`, between the `○` and `␣` buttons:

```html
                        <button class="overview-mark" type="button" id="overview-mark-maybe" data-tool="maybe" aria-pressed="false" aria-label="Werkzeug: vermutet">·</button>
```

- [ ] **Step 6: Make room for four**

In `play.css`, replace the two `grid-template-columns` rules for `.overview-marks`:

```css
.overview-marks {
    grid-row: 2;
    grid-column: 1;
    justify-self: start;
    display: grid;
    grid-template-columns: repeat(4, minmax(var(--tap-min), 72px));
    gap: 6px;
}
```

and in the phone-landscape block:

```css
    .overview-actions .overview-marks {
        grid-row: auto;
        grid-column: 1;
        justify-self: stretch;
        grid-template-columns: repeat(4, minmax(var(--tap-min), 1fr));
    }
```

- [ ] **Step 7: Move the tool out of the overview**

In `overviewCanvas.js`, delete `TOOL_MARK`, the `tool` variable, `renderTools`, the
`TOOL_HINT` map, and the `markButtons` click loop. Change the factory signature from
`markButtons, ... onSetMark` to take a `tool` accessor instead:

```js
export function createOverviewCanvas({
    canvas, minimap, mirrorHost, readoutPair, readoutCats, fitButton,
    puzzle, cellKey, currentTool, onSetMark, onSelect,
}) {
```

Replace `applyTool` with:

```js
    /** Selects the cell and writes whatever the armed tool says to write. */
    function applyTool(cell) {
        setSelected(cell);
        if (!cell) return;
        const mark = nextMark(marks.get(cell.key), currentTool());
        if (mark !== undefined) onSetMark(cell.key, mark);
    }
```

and simplify `renderReadout` so it no longer touches buttons:

```js
    function renderReadout() {
        if (!selected) {
            readoutPair.textContent = 'Keine Zelle gewählt';
            readoutCats.textContent = currentTool() ? 'Tippen markiert' : 'Tippen wählt nur aus';
            return;
        }
        const rowCategory = puzzle.categories[selected.rowCategoryIndex];
        const colCategory = puzzle.categories[selected.colCategoryIndex];
        readoutPair.textContent =
            `${rowCategory.values[selected.rowValue]}  ×  ${colCategory.values[selected.colValue]}`;
        readoutCats.textContent = `${rowCategory.label} × ${colCategory.label}`;
    }
```

Add the import:

```js
import { nextMark } from '../markTool.js';
```

- [ ] **Step 8: Make the pager use the tool too**

In `playController.js`, replace `onCellActivate` so the pager stops cycling:

```js
/**
 * A tap in either view writes the armed tool. The pager used to cycle instead,
 * which meant the two views disagreed and the pager could not place a note.
 */
function onCellActivate(key) {
    if (state.solved || paused) return;
    const mark = nextMark(state.marks.get(key), tool?.current());
    if (mark === undefined) return;
    afterMarkChange(setMarkWith(state, key, mark, valueCount(), derivesCrosses()));
}
```

Add the imports and the module-level handle:

```js
import { createMarkTool, nextMark } from './markTool.js';

let tool = null;
```

In `initPlay`, create it:

```js
    tool = createMarkTool({
        buttons: [
            el('overview-mark-no'), el('overview-mark-yes'),
            el('overview-mark-maybe'), el('overview-mark-clear'),
        ],
    });
```

In `openPlay`, pass the accessor instead of the buttons:

```js
        puzzle, cellKey, currentTool: () => tool.current(), onSetMark: setMark,
```

In `renderPauseState`, replace the overview's own disabling with the tool's:

```js
    tool?.setDisabled(paused);
```

`cycleMark` is now unused. Remove it from the import list in `playController.js`, and
delete the export from `playState.js` together with its tests in
`test/play-implications.test.ts` that call it directly, if any remain.

- [ ] **Step 9: Draw the note**

In `renderer.js`, inside `drawCells`, replace the mark-drawing branch:

```js
        if (!mark) continue;
        ctx.fillStyle = isWrong ? colors.wrong
            : mark === 'yes' ? colors.yes
            : mark === 'maybe' ? colors.maybe
            : colors.no;
        if (mark === 'maybe') {
            // A small dot, deliberately lighter than a settled cross: this is the
            // player's own uncertainty, not a decision.
            ctx.beginPath();
            ctx.arc(point.x + size / 2, point.y + size / 2, Math.max(1, size * 0.12), 0, Math.PI * 2);
            ctx.fill();
        } else if (glyphs) {
            ctx.font = `${mark === 'yes' ? 700 : 400} ${Math.round(size * 0.62)}px system-ui, sans-serif`;
            ctx.fillText(mark === 'yes' ? '○' : '×', point.x + size / 2, point.y + size / 2 + size * 0.02);
        } else {
            const radius = Math.max(1, size * 0.22);
            ctx.beginPath();
            ctx.arc(point.x + size / 2, point.y + size / 2, radius, 0, Math.PI * 2);
            ctx.fill();
        }
```

Add `maybe: '--grid-maybe'` to `COLOR_TOKENS` and `maybe: '#8A8378'` to `FALLBACK`, and
add the token to `tokens.css`: `--grid-maybe: #9aa0ab;` in the light block and
`--grid-maybe: #7c8persistent;` — use `#7c8798` — in the dark block.

- [ ] **Step 10: Name it for assistive technology**

In `a11yMirror.js`, extend `MARK_TEXT`:

```js
const MARK_TEXT = { yes: 'sichere Zuordnung', no: 'ausgeschlossen', maybe: 'vermutet' };
```

- [ ] **Step 11: Verify**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test && npm run build && npx playwright test --reporter=line`
Expected: all pass. Existing overview tests that assert three tool buttons need their
counts updated to four; update the assertion, not the behaviour.

- [ ] **Step 12: Commit**

```bash
git add -A logicals-site
git commit -m "feat(play): one marking tool for both views, with a note mark"
```

---

### Task 7: End-to-end proof of the note

**Files:**
- Modify: `logicals-site/e2e/play-sprint.spec.ts`

- [ ] **Step 1: Add the specs**

```ts
test('a note can be placed and cleared, and survives a reload', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.locator('#overview-mark-maybe').click();
  const key = await tapCell(page, 0);
  const label = () => page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(await label()).toContain('vermutet');

  await page.reload();
  await page.locator('#resume-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
  expect(await label()).toContain('vermutet');

  // Armed on what the cell already holds, the same tool takes it back off.
  await page.locator('#overview-mark-maybe').click();
  await tapCell(page, 0);
  expect(await label()).toContain('leer');
});

test('the pager marks with the same tool as the overview', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.locator('#overview-mark-maybe').click();
  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');

  const cell = page.locator('.play-pager .cell').first();
  const key = await cell.getAttribute('data-key');
  await cell.click();
  // The pager used to cycle to a cross here regardless of the armed tool.
  await expect(cell).toHaveText('·');

  await page.locator('#play-view').click();
  const label = await page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(label).toContain('vermutet');
});

test('a note neither blocks nor completes a solve', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.locator('#overview-mark-maybe').click();
  await tapCell(page, 0);
  await page.locator('#play-check').click();
  await page.locator('#confirm-ok').click().catch(() => { /* no gate on an all-note grid */ });
  // A note is never reported as a wrong mark.
  await expect(page.locator('#play-status')).not.toContainText('stimmt nicht');
});
```

- [ ] **Step 2: Run the suite**

Run: `cd logicals-site && npx playwright test --reporter=line`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add logicals-site/e2e/play-sprint.spec.ts
git commit -m "test(play): cover the note mark across both views"
```

---

# Phase 3 — Duell: Fortschritt des Gegners

> **This is the only phase that changes the database.** The migration is additive and
> nullable, so an older client keeps working against the new schema. Run the full
> Playwright suite before committing anything in this phase.

### Task 8: Schema and migration

**Files:**
- Modify: `logicals-site/db/schema.ts`
- Create: a generated migration under `logicals-site/drizzle/`

- [ ] **Step 1: Add the columns**

In `db/schema.ts`, inside `roomMembers`:

```ts
  // Progress is a COUNT and nothing else. Which cells an opponent has filled
  // would hand over deductions; how many is just tension.
  progressFilled: integer('progress_filled'),
  progressAt: text('progress_at'),
```

- [ ] **Step 2: Generate the migration**

Run: `cd logicals-site && npx drizzle-kit generate`
Expected: a new file in `drizzle/` containing two `ALTER TABLE room_members ADD COLUMN`
statements. Open it and confirm both columns are nullable and there is no table rebuild.

- [ ] **Step 3: Verify the schema tests**

Run: `cd logicals-site && npx vitest run --root . test/schema.test.ts`
Expected: PASS. If the test asserts an exact column list, extend it with the two new
columns.

- [ ] **Step 4: Commit**

```bash
git add logicals-site/db/schema.ts logicals-site/drizzle
git commit -m "feat(duel): add nullable progress columns to room members"
```

---

### Task 9: The progress route

**Files:**
- Modify: `logicals-site/worker/repositories/rooms.ts`
- Modify: `logicals-site/worker/services/rooms.ts`
- Modify: `logicals-site/worker/index.ts`
- Test: `logicals-site/test/rooms.test.ts`

**Interfaces:**
- Consumes: the existing member-token authentication used by `ready` and `loaded`.
- Produces:
  - `POST /api/rooms/:code/progress` with `{ playerId, memberToken, filled }`
  - `GET /api/rooms/:code` members gain `filled: number | null`

- [ ] **Step 1: Write the failing test**

Append to `test/rooms.test.ts`:

```ts
describe('duel progress', () => {
  it('clamps a reported count to the grid it could possibly belong to', async () => {
    const { clampProgress } = await import('../worker/services/rooms') as any;
    // 5 categories x 5 values is 250 cells; anything beyond that is nonsense and
    // a client must not be able to put nonsense in front of the other player.
    expect(clampProgress(-5, 250)).toBe(0);
    expect(clampProgress(12, 250)).toBe(12);
    expect(clampProgress(9999, 250)).toBe(250);
    expect(clampProgress(Number.NaN, 250)).toBe(0);
    expect(clampProgress(3.7, 250)).toBe(3);
  });

  it('knows how many cells a configuration has', async () => {
    const { cellCountFor } = await import('../worker/services/rooms') as any;
    // Ten blocks of 25 for the worst case; three blocks of 16 for the smallest.
    expect(cellCountFor({ categoryCount: 5, valuesPerCategory: 5 })).toBe(250);
    expect(cellCountFor({ categoryCount: 3, valuesPerCategory: 4 })).toBe(48);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/rooms.test.ts`
Expected: FAIL — `clampProgress` and `cellCountFor` are not exported.

- [ ] **Step 3: Add the pure helpers**

In `worker/services/rooms.ts`:

```ts
/** Cells in the full triangular matrix for a configuration. */
export function cellCountFor(configuration: { categoryCount: number; valuesPerCategory: number }): number {
  const categories = configuration.categoryCount;
  const values = configuration.valuesPerCategory;
  const blocks = (categories * (categories - 1)) / 2;
  return blocks * values * values;
}

/** A client may only report a count, and only a possible one. */
export function clampProgress(filled: unknown, cellCount: number): number {
  const value = Number(filled);
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(cellCount, Math.floor(value)));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd logicals-site && npx vitest run --root . test/rooms.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the repository write**

In `worker/repositories/rooms.ts`, add alongside the existing member updates:

```ts
export async function recordMemberProgress(
  db: Database,
  roomId: number,
  playerId: number,
  filled: number,
  nowIso: string,
): Promise<void> {
  await db.update(roomMembers)
    .set({ progressFilled: filled, progressAt: nowIso })
    .where(and(eq(roomMembers.roomId, roomId), eq(roomMembers.playerId, playerId)));
}
```

- [ ] **Step 6: Expose it in the room payload**

In `worker/services/rooms.ts`, in the mapping that already produces
`{ playerId, displayName, role, loaded, ready }`, add:

```ts
      filled: member.progressFilled ?? null,
```

- [ ] **Step 7: Add the route**

In `worker/index.ts`, extend the existing room matcher to accept the new action and
handle it. Change:

```ts
        const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(join|loaded|ready))?$/);
```

to:

```ts
        const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(join|loaded|ready|progress))?$/);
```

and add a branch beside the `ready` one that authenticates with the member token exactly
as `ready` does, then calls `recordMemberProgress` with
`clampProgress(body.filled, cellCountFor(room.configuration))` and returns the updated
room.

- [ ] **Step 8: Verify**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test && npm run build && npx playwright test --reporter=line`
Expected: all pass, including `duel.spec.ts` untouched.

- [ ] **Step 9: Commit**

```bash
git add logicals-site/worker logicals-site/test/rooms.test.ts
git commit -m "feat(duel): accept and serve a progress count per member"
```

---

### Task 10: Report and show it

**Files:**
- Create: `logicals-site/client/js/duel/progressReporter.js`
- Modify: `logicals-site/client/js/duel/roomApi.js`
- Modify: `logicals-site/client/js/play/playController.js`
- Modify: `logicals-site/client/index.html`, `client/styles/play.css`

**Interfaces:**
- Consumes: `getDuelRoom` from `roomApi.js`.
- Produces:
  - `reportDuelProgress(code, payload)` in `roomApi.js`
  - `createProgressReporter({ room, player, onOpponent }) -> { report(filled), stop() }`

- [ ] **Step 1: Add the API call**

In `roomApi.js`:

```js
export function reportDuelProgress(code, payload) {
    return request(`/api/rooms/${code}/progress`, jsonPost(payload));
}
```

- [ ] **Step 2: Write the reporter**

```js
// logicals-site/client/js/duel/progressReporter.js
/**
 * Reports how many cells this player has filled, and polls for the opponent's.
 *
 * Its own loop, because the lobby's polling is deliberately stopped the moment
 * play begins (`startGame` calls `stopLobby`) - there is otherwise no room
 * traffic at all during a duel.
 *
 * Five seconds each way. A duel runs for minutes, so a faster rate buys nothing
 * and costs the free tier. Only a COUNT is ever sent: which cells would hand
 * over deductions, how many is just tension.
 */

import { getDuelRoom, reportDuelProgress } from './roomApi.js';

const INTERVAL_MS = 5000;

export function createProgressReporter({ room, player, onOpponent }) {
    let lastReported = -1;
    let pending = 0;
    let timer = null;
    let stopped = false;

    async function tick() {
        if (stopped) return;
        try {
            if (pending !== lastReported) {
                await reportDuelProgress(room.code, {
                    playerId: player.id, memberToken: room.memberToken, filled: pending,
                });
                lastReported = pending;
            }
            const response = await getDuelRoom(room.code);
            const opponent = response.room.members.find(member => member.playerId !== player.id);
            if (opponent) onOpponent(opponent);
        } catch {
            // A duel must not fall over because the room is briefly unreachable.
            // The next tick tries again.
        }
        if (!stopped) timer = setTimeout(tick, INTERVAL_MS);
    }

    timer = setTimeout(tick, INTERVAL_MS);

    return {
        report(filled) { pending = filled; },
        stop() { stopped = true; clearTimeout(timer); },
    };
}
```

- [ ] **Step 3: Add the display**

In `index.html`, inside `.play-head`, after `#play-status`:

```html
            <p class="hint duel-progress" id="duel-progress" hidden></p>
```

In `play.css`:

```css
.duel-progress { font-variant-numeric: tabular-nums; color: var(--muted); }
.duel-progress[hidden] { display: none; }
```

- [ ] **Step 4: Wire it in the controller**

In `playController.js`, add the import and a handle:

```js
import { createProgressReporter } from '../duel/progressReporter.js';

let progress = null;
```

In `openPlay`, after the timer is set up:

```js
    progress?.stop();
    progress = context.mode === 'duel'
        ? createProgressReporter({
            room: context.room,
            player: context.player,
            onOpponent: member => {
                const node = el('duel-progress');
                node.hidden = member.filled === null || member.filled === undefined;
                node.textContent = `Gegner: ${member.filled} Felder gesetzt`;
            },
        })
        : null;
    el('duel-progress').hidden = context.mode !== 'duel';
```

In `afterMarkChange`, keep the reporter fed:

```js
    progress?.report(state.marks.size);
```

In the `onLeave` handler in `initPlay`, alongside `timer.stop()`:

```js
        progress?.stop();
        progress = null;
```

- [ ] **Step 5: Verify**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test && npm run build && npx playwright test --reporter=line`
Expected: all pass.

- [ ] **Step 6: Extend the duel e2e**

In `e2e/duel.spec.ts`, after both players are in play, add:

```ts
  // Progress crosses as a count and nothing else.
  await host.locator('#overview-mark-no').click();
  const hostCells = host.locator('.overview-mirror__cell');
  for (const index of [0, 1, 2]) {
    const box = (await hostCells.nth(index).boundingBox())!;
    await host.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect(guest.locator('#duel-progress')).toContainText('Felder gesetzt', { timeout: 20_000 });
  // The guest's own grid is untouched by what the host did.
  await expect(guest.locator('#play-undo')).toBeDisabled();
```

- [ ] **Step 7: Run the duel spec**

Run: `cd logicals-site && npx playwright test e2e/duel.spec.ts --reporter=line`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add -A logicals-site
git commit -m "feat(duel): show how many cells the opponent has filled"
```

---

# Phase 4 — Widersprüche erkennen

### Task 11: The rules

**Files:**
- Modify: `logicals-site/client/playLogic.js`
- Test: `logicals-site/test/play-contradictions.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `findContradictions(marks, categoryCount, valueCount) -> Set<string>` — every
  key involved in a contradiction, derived from the player's own marks alone.

- [ ] **Step 1: Write the failing test**

```ts
// logicals-site/test/play-contradictions.test.ts
import { describe, expect, it } from 'vitest';
import PlayLogic from '../client/playLogic.js';

const { findContradictions } = PlayLogic as any;
const V = 5;
const C = 5;

const marksOf = (entries: Array<[string, string]>) => new Map(entries);

describe('contradictions in the player\'s own marks', () => {
  it('finds nothing in an empty grid', () => {
    expect([...findContradictions(marksOf([]), C, V)]).toEqual([]);
  });

  it('finds nothing in a consistent block', () => {
    const marks = marksOf([
      ['0.1.0.0', 'yes'], ['0.1.0.1', 'no'], ['0.1.1.0', 'no'],
    ]);
    expect([...findContradictions(marks, C, V)]).toEqual([]);
  });

  it('flags two confirmations in one row', () => {
    const marks = marksOf([['0.1.2.1', 'yes'], ['0.1.2.3', 'yes']]);
    expect([...findContradictions(marks, C, V)].sort()).toEqual(['0.1.2.1', '0.1.2.3']);
  });

  it('flags two confirmations in one column', () => {
    const marks = marksOf([['0.1.1.4', 'yes'], ['0.1.3.4', 'yes']]);
    expect([...findContradictions(marks, C, V)].sort()).toEqual(['0.1.1.4', '0.1.3.4']);
  });

  it('flags a row with nothing left to assign', () => {
    const marks = marksOf(
      Array.from({ length: V }, (_, column) => [`0.1.2.${column}`, 'no'] as [string, string]),
    );
    const found = [...findContradictions(marks, C, V)];
    expect(found).toHaveLength(V);
    expect(found.every(key => key.startsWith('0.1.2.'))).toBe(true);
  });

  it('flags a column with nothing left to assign', () => {
    const marks = marksOf(
      Array.from({ length: V }, (_, row) => [`0.1.${row}.2`, 'no'] as [string, string]),
    );
    expect([...findContradictions(marks, C, V)]).toHaveLength(V);
  });

  it('flags a transitive impossibility across blocks', () => {
    // A=B and A=C are confirmed, so B=C must hold - but it is crossed out.
    const marks = marksOf([
      ['0.1.0.0', 'yes'],   // A0 = B0
      ['0.2.0.0', 'yes'],   // A0 = C0
      ['1.2.0.0', 'no'],    // B0 != C0  <- impossible
    ]);
    expect([...findContradictions(marks, C, V)].sort()).toEqual(['0.1.0.0', '0.2.0.0', '1.2.0.0']);
  });

  it('ignores notes entirely', () => {
    // A note is uncertainty, not a claim, so it cannot contradict anything.
    const marks = marksOf([['0.1.2.1', 'maybe'], ['0.1.2.3', 'maybe']]);
    expect([...findContradictions(marks, C, V)]).toEqual([]);
  });

  it('never reports a cell that carries no mark', () => {
    const marks = marksOf([['0.1.2.1', 'yes'], ['0.1.2.3', 'yes']]);
    for (const key of findContradictions(marks, C, V)) {
      expect(marks.has(key)).toBe(true);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/play-contradictions.test.ts`
Expected: FAIL — `findContradictions` is not a function.

- [ ] **Step 3: Write the implementation**

Add inside the factory in `client/playLogic.js`, before the `return`:

```js
    /**
     * Contradictions among the player's OWN marks.
     *
     * This deliberately never looks at the solution, which is why it can be
     * shown without a confirmation: it says "these marks cannot all be true
     * together", never "this one is wrong". `evaluate` is the one that knows the
     * answer, and it stays behind its gate.
     *
     * Notes are ignored - uncertainty is not a claim and cannot contradict.
     */
    function findContradictions(marks, categoryCount, valueCount) {
        const found = new Set();
        const at = (a, b, va, vb) => marks.get(pairKey(a, b, va, vb));

        for (let a = 0; a < categoryCount; a++) {
            for (let b = a + 1; b < categoryCount; b++) {
                for (let line = 0; line < valueCount; line++) {
                    // Rows of this block, then columns, by swapping the indexes.
                    for (const asRow of [true, false]) {
                        const key = index => asRow
                            ? pairKey(a, b, line, index)
                            : pairKey(a, b, index, line);

                        const confirmed = [];
                        let crossed = 0;
                        for (let index = 0; index < valueCount; index++) {
                            const mark = marks.get(key(index));
                            if (mark === 'yes') confirmed.push(key(index));
                            else if (mark === 'no') crossed++;
                        }

                        // Two things assigned to the same one.
                        if (confirmed.length > 1) for (const entry of confirmed) found.add(entry);
                        // Nothing left that could be assigned.
                        if (crossed === valueCount) {
                            for (let index = 0; index < valueCount; index++) found.add(key(index));
                        }
                    }
                }
            }
        }

        // Transitivity: A=B and A=C force B=C, so a cross there is impossible.
        for (let a = 0; a < categoryCount; a++) {
            for (let b = 0; b < categoryCount; b++) {
                for (let c = 0; c < categoryCount; c++) {
                    if (a === b || a === c || b === c) continue;
                    for (let va = 0; va < valueCount; va++) {
                        for (let vb = 0; vb < valueCount; vb++) {
                            if (at(Math.min(a, b), Math.max(a, b),
                                a < b ? va : vb, a < b ? vb : va) !== 'yes') continue;
                            for (let vc = 0; vc < valueCount; vc++) {
                                if (at(Math.min(a, c), Math.max(a, c),
                                    a < c ? va : vc, a < c ? vc : va) !== 'yes') continue;
                                if (at(Math.min(b, c), Math.max(b, c),
                                    b < c ? vb : vc, b < c ? vc : vb) !== 'no') continue;
                                found.add(cellKey(a, va, b, vb));
                                found.add(cellKey(a, va, c, vc));
                                found.add(cellKey(b, vb, c, vc));
                            }
                        }
                    }
                }
            }
        }

        return found;
    }
```

and add it to the returned object:

```js
    return { pairKey, cellKey, buildTruthSet, evaluate, findContradictions };
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd logicals-site && npx vitest run --root . test/play-contradictions.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/playLogic.js logicals-site/test/play-contradictions.test.ts
git commit -m "feat(play): detect contradictions without looking at the solution"
```

---

### Task 12: Show them

**Files:**
- Modify: `logicals-site/client/js/play/playController.js`
- Modify: `logicals-site/client/js/play/overview/renderer.js`
- Modify: `logicals-site/client/styles/tokens.css`, `client/styles/play.css`
- Modify: `logicals-site/e2e/play-sprint.spec.ts`

- [ ] **Step 1: Add the colour**

In `tokens.css`, light block:

```css
    --grid-conflict: #b8860b;
    --grid-conflict-fill: #fdf3d6;
```

dark block:

```css
        --grid-conflict: #e0b64a;
        --grid-conflict-fill: #33290f;
```

Add `conflict: '--grid-conflict'` and `conflictFill: '--grid-conflict-fill'` to
`COLOR_TOKENS`, with `#B8860B` and `#FDF3D6` in `FALLBACK`.

- [ ] **Step 2: Paint them**

In `renderer.js`, `drawCells` takes `conflicts` alongside `wrong`, and the fill choice
becomes:

```js
        const isWrong = wrong.has(cell.key);
        const isConflict = !isWrong && conflicts.has(cell.key);

        ctx.fillStyle = isWrong ? colors.wrongFill
            : isConflict ? colors.conflictFill
            : mark === 'yes' ? colors.yesFill
            : mark === 'no' ? colors.noFill
            : colors.surface;
```

`wrong` wins where both apply: red means "this contradicts the solution", and that is
the stronger statement.

Thread `conflicts` through `render` the same way `wrong` already is.

- [ ] **Step 3: Compute and fan out**

In `playController.js`, add to the module state:

```js
/** Recomputed after every change; 250 cells is nothing. */
let conflicts = new Set();
```

In `afterMarkChange`, before painting:

```js
    conflicts = findContradictions(state.marks, state.puzzle.categories.length, valueCount());
```

Extend `paintCell` to pass it on, and add the count to the status line only when it is
non-zero, without a gate — it is not a spoiler:

```js
    const count = conflicts.size;
    if (count > 0) setStatus(`${count} Markierungen widersprechen sich.`);
```

Import `findContradictions` from `window.PlayLogic` alongside the others:

```js
const { cellKey, buildTruthSet, evaluate, findContradictions } = window.PlayLogic;
```

- [ ] **Step 4: Prove it end to end**

Append to `e2e/play-sprint.spec.ts`:

```ts
test('two confirmations in one row are flagged without revealing anything', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  // Two confirmations in the same row of one block cannot both hold.
  await page.locator('#overview-mark-yes').click();
  await page.evaluate(() => {
    const cells = [...document.querySelectorAll('.overview-mirror__cell')];
    const first = cells.find(cell => cell.getAttribute('data-key')?.startsWith('0.1.0.'))!;
    const second = cells.find(cell => cell.getAttribute('data-key') === '0.1.0.3')!;
    (first as HTMLElement).click();
    (second as HTMLElement).click();
  });

  await expect(page.locator('#play-status')).toContainText('widersprechen sich');
  // And it said so without ever consulting the solution.
  await expect(page.locator('#play-solution-table')).toBeEmpty();
});
```

- [ ] **Step 5: Verify everything**

```bash
cd /home/jonas/Documents/Code/-german-logic-puzzle-generator
npx jest && npx tsc --noEmit
cd logicals-site
npx tsc --noEmit && npx vitest run --root . test && npm run build
npx playwright test --reporter=line
```

Expected: 162 generator tests, both typechecks, the build, every site unit test, and
every Playwright scenario green.

- [ ] **Step 6: Commit**

```bash
git add -A logicals-site
git commit -m "feat(play): highlight contradicting marks without a spoiler gate"
```

---

### Task 13: Acceptance pass

**Files:** none modified.

- [ ] **Step 1: Capture the device matrix**

Re-run the acceptance screenshot script across iPhone 13 mini portrait and landscape,
iPhone 14, and iPad in both orientations, in light and dark, with a note, a derived
cross, and a contradiction on screen.

- [ ] **Step 2: Confirm the tree and push**

```bash
cd /home/jonas/Documents/Code/-german-logic-puzzle-generator
git status --short        # must be empty
git push
```

- [ ] **Step 3: Stop**

Do **not** update the ChatGPT Site. Publishing is a separate step and needs explicit
approval, with the migration called out: this sprint is the first change in the redesign
that alters the database.

---

## Self-Review

**Spec coverage.** §1 Weiterspielen → Tasks 1–4. §2 Notiz-Markierung → Tasks 5–7,
including the pager unification the spec requires. §3 Duell-Fortschritt → Tasks 8–10,
with the migration isolated in Task 8. §4 Widersprüche → Tasks 11–12. Acceptance criteria
1–2 → Task 4; 3–4 → Task 7; 5 → Task 10 Step 6; 6 → Task 12 Step 4; 7 → Task 12 Step 5.

**Placeholder scan.** One defect found and fixed: Task 6 Step 9 contained a corrupted
token value (`#7c8persistent`); it reads `#7c8798`. No TBDs, no "handle edge cases", no
"similar to Task N".

**Type consistency.** `nextMark(current, tool)` returns `'no'|'yes'|'maybe'|null|undefined`
and is used with that contract in Tasks 6 and 8. `createMarkTool({ buttons, onChange })`
exposes `current()` and `setDisabled()`, both used in Task 6.
`findContradictions(marks, categoryCount, valueCount)` matches between Tasks 11 and 12.
`createProgressReporter({ room, player, onOpponent })` exposes `report()` and `stop()`,
both used in Task 10. `loadResume(playerId)` takes an id, not a player, in Tasks 1 and 3.

**Known risk, called out rather than hidden.** Task 3 Step 6 depends on
`resultScreen.js` passing a puzzle index to `onPlay`. It already passes one to `onDuel`,
so the shape exists — but the step verifies it rather than assuming, and says what to do
if it is absent.

**Ordering constraint.** Task 5 must land before Task 6: the tool bar gains a note button
that writes a mark the state layer has to understand first.
