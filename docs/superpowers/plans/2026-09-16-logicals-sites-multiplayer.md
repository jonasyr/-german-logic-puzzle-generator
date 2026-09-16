# Logicals Sites Multiplayer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish the current iOS-optimized Logicals app on ChatGPT Sites with browser-side runtime generation, persistent player profiles and results, and synchronized two-player duels with independent grids.

**Architecture:** A standalone `logicals-site/` package carries an exact copy of the current vanilla frontend, bundles `logic-puzzle-generator@1.4.1` into a browser Web Worker, and emits a Cloudflare Worker-compatible Sites artifact. The Worker serves narrow JSON APIs backed by D1; puzzle marks stay in each browser, while player, room, readiness, start, and result records are durable.

**Tech Stack:** Vanilla HTML/CSS/ES modules, TypeScript 5.9, Vite 8, esbuild, Vitest 4, Cloudflare Worker APIs, D1/SQLite, Drizzle ORM migrations, npm, existing Jest suite, Playwright device regression checks.

**Spec:** `docs/superpowers/specs/2026-09-16-logicals-sites-multiplayer-design.md`

## Global Constraints

- Treat `webapp/` at commit `b03a226f1810ba7229583dc486751937eafc16aa` as the visual and interaction baseline.
- Do not replace the vanilla frontend with React or a generic Sites starter UI.
- Keep the existing TypeScript generator deterministic; do not duplicate its algorithms.
- Keep solo pause behavior unchanged; duel pause covers the grid while the authoritative clock continues.
- A duel has exactly two distinct players and a four-second shared countdown.
- Player display names contain 1–40 Unicode characters after trimming and use NFKC, collapsed whitespace, and German locale lowercase normalization for uniqueness.
- Room codes contain six uppercase non-ambiguous characters.
- Store no grid marks, passwords, email addresses, device identifiers, or chat content.
- Defer PDF rendering; the first Sites build must not advertise a working PDF download.
- Add a failing test before every production behavior change and keep commits scoped to one task.
- Preserve all relevant root Jest tests and the existing NPM package build.
- Publish privately and do not change the Site audience without a separate explicit instruction.

---

## Planned File Structure

`logicals-site/` is self-contained so Sites can build and publish it without changing the root package’s NPM release behavior.

- `logicals-site/package.json` — site-only scripts and pinned dependencies.
- `logicals-site/package-lock.json` — reproducible dependency graph.
- `logicals-site/tsconfig.json` — Worker, generation worker, and tests.
- `logicals-site/vite.config.ts` — browser build rooted at `client/`.
- `logicals-site/scripts/build.mjs` — browser build, Worker bundle, hosting manifest, and migration staging.
- `logicals-site/.openai/hosting.json` — Sites project identity and logical `DB` binding.
- `logicals-site/client/` — copied iOS frontend, then minimally extended.
- `logicals-site/client/js/generation/` — Web Worker client, worker entry, and canonical fingerprinting.
- `logicals-site/client/js/players/` — selected-player state, dialog, and history rendering.
- `logicals-site/client/js/results/` — completion payload and durable local outbox.
- `logicals-site/client/js/duel/` — room API, lobby controller, and comparison rendering.
- `logicals-site/worker/index.ts` — Worker fetch entrypoint and static-asset fallback.
- `logicals-site/worker/http.ts` — JSON parsing, responses, routing errors, and CORS-free same-origin handling.
- `logicals-site/worker/validation.ts` — request validation and player normalization.
- `logicals-site/worker/repositories/` — D1 prepared statements for players, rooms, and results.
- `logicals-site/worker/services/` — player, room-transition, countdown, idempotency, and ranking rules.
- `logicals-site/db/schema.ts` — Drizzle schema.
- `logicals-site/drizzle/` — generated immutable SQL and metadata.
- `logicals-site/test/` — Vitest unit and Worker request tests.
- `logicals-site/e2e/` — Playwright solo, duel, and iOS regression tests.

---

### Task 1: Establish the standalone Sites package without changing the UI

**Files:**
- Create: `logicals-site/package.json`
- Create: `logicals-site/tsconfig.json`
- Create: `logicals-site/vite.config.ts`
- Create: `logicals-site/scripts/build.mjs`
- Create: `logicals-site/.openai/hosting.json`
- Copy: `webapp/**` to `logicals-site/client/**`
- Create: `logicals-site/test/app-shell.test.ts`

**Interfaces:**
- Consumes: the current `webapp/` tree and published `logic-puzzle-generator@1.4.1`.
- Produces: `npm run build` with `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

- [ ] **Step 1: Write the failing app-shell test**

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Sites app shell', () => {
  it('keeps the existing Logicals iOS shell', () => {
    const html = readFileSync(resolve('client/index.html'), 'utf8');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('id="screen-start"');
    expect(html).toContain('id="screen-play"');
    expect(html).toContain('./js/main.js');
  });
});
```

- [ ] **Step 2: Run the test and verify the package does not exist yet**

Run: `cd logicals-site && npm test -- test/app-shell.test.ts`
Expected: FAIL because `package.json` and `client/index.html` do not exist.

- [ ] **Step 3: Create the package and copy the frontend baseline**

Create scripts `dev`, `build`, `test`, `test:e2e`, `db:generate`, and `preview`. Pin `logic-puzzle-generator` to `1.4.1`, Vite to `8.0.13`, Vitest to `4.0.16`, TypeScript to `5.9.3`, Wrangler to `4.92.0`, Drizzle ORM to `0.45.2`, and Drizzle Kit to `0.31.10`. Copy the complete `webapp/` tree without edits before adding Sites behavior.

Set `.openai/hosting.json` to:

```json
{
  "d1": "DB",
  "r2": null
}
```

The build script must clear only `logicals-site/dist`, run Vite for `client/`, bundle `worker/index.ts` as ESM to `dist/server/index.js`, and copy the hosting manifest plus `drizzle/` into `dist/.openai/`.

- [ ] **Step 4: Verify baseline build and root package isolation**

Run: `cd logicals-site && npm install && npm test && npm run build`
Expected: PASS; the three required deployment paths exist.

Run: `npm test -- --runInBand && npm run build`
Expected: PASS in the repository root; the existing NPM package still emits `dist/src/index.js`.

- [ ] **Step 5: Commit**

```bash
git add logicals-site
git commit -m "build: add standalone Logicals Sites package"
```

---

### Task 2: Move deterministic booklet generation into a browser Web Worker

**Files:**
- Create: `logicals-site/client/js/generation/canonicalPuzzle.ts`
- Create: `logicals-site/client/js/generation/booklet.worker.ts`
- Create: `logicals-site/client/js/generation/generatorClient.js`
- Modify: `logicals-site/client/js/api.js`
- Test: `logicals-site/test/generation.test.ts`

**Interfaces:**
- Produces: `canonicalPuzzle(puzzle): string`, `fingerprintPuzzle(puzzle): Promise<string>`, and `generateBooklet(options): Promise<{ booklet: GermanLogicBooklet; durationMs: number }>`.
- Preserves: `fetchOptions()` and `fetchBooklet(options)` return shapes already consumed by `configScreen.js` and `main.js`.

- [ ] **Step 1: Write failing deterministic worker tests**

```ts
import { describe, expect, it } from 'vitest';
import { generateGermanLogicBooklet } from 'logic-puzzle-generator';
import { canonicalPuzzle, fingerprintPuzzle } from '../client/js/generation/canonicalPuzzle';

describe('runtime generation', () => {
  it('ignores generatedAt while fingerprinting puzzle truth', async () => {
    const puzzle = generateGermanLogicBooklet({ puzzleCount: 1, seed: 77 }).puzzles[0];
    const clone = JSON.parse(JSON.stringify(puzzle));
    clone.generatedAt = '2099-01-01';
    expect(canonicalPuzzle(clone)).toBe(canonicalPuzzle(puzzle));
    expect(await fingerprintPuzzle(clone)).toBe(await fingerprintPuzzle(puzzle));
  });
});
```

- [ ] **Step 2: Run the test and verify missing-module failure**

Run: `cd logicals-site && npm test -- test/generation.test.ts`
Expected: FAIL because `canonicalPuzzle.ts` does not exist.

- [ ] **Step 3: Implement canonical serialization, SHA-256, and worker RPC**

Canonicalize exactly `{ categories, clues, targetQuestion, solutionRows }` with recursively sorted object keys and original array order. Hash UTF-8 bytes with `crypto.subtle.digest('SHA-256', bytes)` and return lowercase hexadecimal.

The worker accepts `{ id, type: 'generate', options }`, calls `generateGermanLogicBooklet({ generatedAt: today, ...options })`, and posts `{ id, ok: true, booklet, durationMs }`; errors return `{ id, ok: false, error }`. `generatorClient.js` keeps one worker and resolves requests by numeric ID.

Replace network-backed `fetchOptions` with locally imported limits/themes and set `pdfAvailable: false`. Replace `fetchBooklet` with the worker client. Keep `fetchPdf` throwing `new Error('PDF-Export ist in dieser Version noch nicht verfügbar.')`.

- [ ] **Step 4: Verify generation and the existing consumer contract**

Run: `cd logicals-site && npm test -- test/generation.test.ts && npm run build`
Expected: PASS; Vite emits a dedicated generation-worker asset and no `/api/booklet` request remains in the client bundle.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/js/generation logicals-site/client/js/api.js logicals-site/test/generation.test.ts
git commit -m "feat: generate Logicals in a browser worker"
```

---

### Task 3: Define the D1 schema and immutable initial migration

**Files:**
- Create: `logicals-site/db/schema.ts`
- Create: `logicals-site/drizzle.config.ts`
- Create: `logicals-site/drizzle/0000_logicals_multiplayer.sql`
- Create: `logicals-site/drizzle/meta/_journal.json`
- Create: `logicals-site/drizzle/meta/0000_snapshot.json`
- Test: `logicals-site/test/schema.test.ts`

**Interfaces:**
- Produces tables `players`, `rooms`, `room_members`, and `results` with the columns in the approved spec.
- Produces indexes `idx_results_player_completed`, `idx_rooms_code`, and `idx_rooms_expires_at`.

- [ ] **Step 1: Write the failing schema contract test**

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('D1 migration', () => {
  it('creates the four durable entities and required uniqueness', () => {
    const sql = readFileSync('drizzle/0000_logicals_multiplayer.sql', 'utf8');
    for (const table of ['players', 'rooms', 'room_members', 'results']) {
      expect(sql).toContain(`CREATE TABLE \`${table}\``);
    }
    expect(sql).toContain('normalized_name');
    expect(sql).toContain('attempt_key');
    expect(sql).toContain('UNIQUE');
  });
});
```

- [ ] **Step 2: Run the test and verify the migration is absent**

Run: `cd logicals-site && npm test -- test/schema.test.ts`
Expected: FAIL with file-not-found for `0000_logicals_multiplayer.sql`.

- [ ] **Step 3: Implement schema and generate migration**

Use integer primary keys, UTC ISO text timestamps, `rooms.state` text constrained to `waiting`, `countdown`, `active`, `complete`, or `expired`, and foreign keys with `ON DELETE RESTRICT`. Enforce unique player normalization, room code, `(room_id, player_id)`, `(room_id, role)`, attempt key, and `(room_id, player_id)` for duel results. Add `PRAGMA optimize;` after the indexes.

Run: `cd logicals-site && npm run db:generate`
Inspect the generated SQL and rename only the unapplied initial migration to `0000_logicals_multiplayer.sql`, updating its matching journal metadata before any deployment.

- [ ] **Step 4: Verify schema contract and D1-safe SQL**

Run: `cd logicals-site && npm test -- test/schema.test.ts && npm run build`
Expected: PASS; `dist/.openai/drizzle/0000_logicals_multiplayer.sql` contains complete statements.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/db logicals-site/drizzle logicals-site/drizzle.config.ts logicals-site/test/schema.test.ts
git commit -m "feat: define Logicals multiplayer schema"
```

---

### Task 4: Implement validation, player repository, and player API

**Files:**
- Create: `logicals-site/worker/types.ts`
- Create: `logicals-site/worker/http.ts`
- Create: `logicals-site/worker/validation.ts`
- Create: `logicals-site/worker/repositories/players.ts`
- Create: `logicals-site/worker/services/players.ts`
- Create: `logicals-site/worker/index.ts`
- Test: `logicals-site/test/players.test.ts`

**Interfaces:**
- Produces: `normalizePlayerName(input: unknown): { displayName: string; normalizedName: string }`.
- Produces endpoints: `GET /api/players`, `POST /api/players`, and `GET /api/players/:id/results`.
- `POST /api/players` consumes `{ "displayName": string }` and returns `{ "player": Player }` with status 200 for an existing normalized name or 201 for a new name.

- [ ] **Step 1: Write failing normalization and API service tests**

```ts
import { describe, expect, it } from 'vitest';
import { normalizePlayerName } from '../worker/validation';

describe('player names', () => {
  it('normalizes Unicode, whitespace, and German casing', () => {
    expect(normalizePlayerName('  JONAS\u00a0  Müller  ')).toEqual({
      displayName: 'JONAS Müller',
      normalizedName: 'jonas müller',
    });
  });

  it('rejects an empty or overlong name', () => {
    expect(() => normalizePlayerName('   ')).toThrow('Name muss 1 bis 40 Zeichen lang sein.');
    expect(() => normalizePlayerName('x'.repeat(41))).toThrow('Name muss 1 bis 40 Zeichen lang sein.');
  });
});
```

- [ ] **Step 2: Run the test and verify missing implementation**

Run: `cd logicals-site && npm test -- test/players.test.ts`
Expected: FAIL because `worker/validation.ts` does not exist.

- [ ] **Step 3: Implement prepared statements and route handling**

Use exactly one SQL statement per `prepare()` call. Create-or-resolve must first query by `normalized_name`, insert when absent, and recover a unique-race by re-querying. Return errors as `{ error: { code, message } }` with German user-facing messages and never expose SQL text.

`worker/index.ts` must route `/api/*` first and otherwise return `env.ASSETS.fetch(request)`. Export a default object with `fetch(request, env, ctx)`.

- [ ] **Step 4: Verify player behavior and Worker bundle**

Run: `cd logicals-site && npm test -- test/players.test.ts && npm run build`
Expected: PASS; `dist/server/index.js` exports a default fetch handler.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/worker logicals-site/test/players.test.ts
git commit -m "feat: add persistent player profiles"
```

---

### Task 5: Implement result persistence, idempotency, history, and ranking

**Files:**
- Create: `logicals-site/worker/repositories/results.ts`
- Create: `logicals-site/worker/services/results.ts`
- Modify: `logicals-site/worker/index.ts`
- Test: `logicals-site/test/results.test.ts`

**Interfaces:**
- Produces endpoint `POST /api/results` consuming `ResultSubmission`.
- Produces endpoint `GET /api/players/:id/results?limit=50` ordered by `completed_at DESC, id DESC`.
- Produces `rankDuelResults(a, b): 'a' | 'b' | 'tie'` comparing `elapsedMs` first and `failedChecks` second.

- [ ] **Step 1: Write failing result-domain tests**

```ts
import { describe, expect, it } from 'vitest';
import { rankDuelResults } from '../worker/services/results';

describe('duel ranking', () => {
  it('ranks time before failed checks and supports ties', () => {
    expect(rankDuelResults({ elapsedMs: 50_000, failedChecks: 4 }, { elapsedMs: 51_000, failedChecks: 0 })).toBe('a');
    expect(rankDuelResults({ elapsedMs: 50_000, failedChecks: 2 }, { elapsedMs: 50_000, failedChecks: 1 })).toBe('b');
    expect(rankDuelResults({ elapsedMs: 50_000, failedChecks: 1 }, { elapsedMs: 50_000, failedChecks: 1 })).toBe('tie');
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cd logicals-site && npm test -- test/results.test.ts`
Expected: FAIL because `rankDuelResults` does not exist.

- [ ] **Step 3: Implement validated, idempotent result writes**

Require UUID attempt keys, nonnegative integer elapsed milliseconds, nonnegative integer failed checks, a 64-character lowercase hexadecimal fingerprint, and canonical server-side room data for duel display fields. A repeated attempt key returns the existing result with status 200. A new result returns status 201. Enforce one duel result per room member.

- [ ] **Step 4: Verify ranking, retries, and query ordering**

Run: `cd logicals-site && npm test -- test/results.test.ts`
Expected: PASS for faster time, equal-time error comparison, tie, duplicate attempt, and newest-first history fixtures.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/worker/repositories/results.ts logicals-site/worker/services/results.ts logicals-site/worker/index.ts logicals-site/test/results.test.ts
git commit -m "feat: persist idempotent player results"
```

---

### Task 6: Add the iOS-style player selector and personal history

**Files:**
- Modify: `logicals-site/client/index.html`
- Modify: `logicals-site/client/styles/components.css`
- Modify: `logicals-site/client/styles/screens.css`
- Create: `logicals-site/client/js/players/playerApi.js`
- Create: `logicals-site/client/js/players/playerStore.js`
- Create: `logicals-site/client/js/players/playerController.js`
- Create: `logicals-site/client/js/screens/historyScreen.js`
- Modify: `logicals-site/client/js/main.js`
- Test: `logicals-site/test/player-ui.test.ts`

**Interfaces:**
- Produces `initPlayers(): Promise<Player>` and `getSelectedPlayer(): Player | null`.
- Persists only the selected player ID and cached list under `logicals:selected-player` and `logicals:players-cache`.

- [ ] **Step 1: Write the failing player-store test**

```ts
import { describe, expect, it } from 'vitest';
import { chooseSelectedPlayer } from '../client/js/players/playerStore';

describe('player selection', () => {
  it('keeps the remembered player only when it still exists', () => {
    const players = [{ id: 1, displayName: 'Jonas' }, { id: 2, displayName: 'Lea' }];
    expect(chooseSelectedPlayer(players, 2)?.id).toBe(2);
    expect(chooseSelectedPlayer(players, 9)?.id).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cd logicals-site && npm test -- test/player-ui.test.ts`
Expected: FAIL because `playerStore.js` does not exist.

- [ ] **Step 3: Add the minimal start-screen and history UI**

Keep the current start card and insert one grouped selector row above the actions. Add “Alleine spielen”, “Duell spielen”, and “Historie” actions using existing button classes. Use the shared confirm/dialog visual language for name creation, with a 16px input and a safe default action. Add a history screen with existing `bar`, `rows`, and metadata styles; do not alter the play screen layout.

When the API is temporarily unavailable, show cached players and a recoverable hint. New-player creation remains disabled until connectivity returns.

- [ ] **Step 4: Verify UI logic and build**

Run: `cd logicals-site && npm test -- test/player-ui.test.ts && npm run build`
Expected: PASS; the start screen still contains the original Logicals title and now requires a selected player before either play action.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client logicals-site/test/player-ui.test.ts
git commit -m "feat: add player selection and history"
```

---

### Task 7: Record solo completions and retry them from a durable outbox

**Files:**
- Create: `logicals-site/client/js/results/resultApi.js`
- Create: `logicals-site/client/js/results/outbox.js`
- Create: `logicals-site/client/js/results/completion.js`
- Modify: `logicals-site/client/js/play/playController.js`
- Modify: `logicals-site/client/js/play/playState.js`
- Modify: `logicals-site/client/js/main.js`
- Test: `logicals-site/test/outbox.test.ts`
- Test: `logicals-site/test/failed-checks.test.ts`

**Interfaces:**
- Produces `queueResult(submission)`, `flushOutbox(send)`, and `createCompletionSubmission(context)`.
- Extends play state with `attemptKey` and `failedChecks`.
- Extends `openPlay(puzzle, context)` where context is `{ mode: 'solo' | 'duel'; player; options; room?: RoomSnapshot }`.

- [ ] **Step 1: Write failing outbox and failed-check tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { flushItems } from '../client/js/results/outbox';

describe('result outbox', () => {
  it('removes successful items and keeps transient failures with the same key', async () => {
    const send = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('offline'));
    const items = [{ attemptKey: 'a' }, { attemptKey: 'b' }];
    expect(await flushItems(items, send)).toEqual([{ attemptKey: 'b' }]);
    expect(items[1].attemptKey).toBe('b');
  });
});
```

- [ ] **Step 2: Run tests and verify missing modules**

Run: `cd logicals-site && npm test -- test/outbox.test.ts test/failed-checks.test.ts`
Expected: FAIL because outbox and failed-check accounting do not exist.

- [ ] **Step 3: Implement completion instrumentation**

Generate one UUID when a new play attempt opens and persist it with play state. Increment `failedChecks` only after a confirmed Prüfen action returns at least one wrong mark. On solve, stop the timer, queue the immutable result, attempt immediate submission, and retain it on failure. Flush on app start and the browser `online` event.

Do not submit marks, undo history, used clues, or the solution.

- [ ] **Step 4: Verify solo regression and idempotent retries**

Run: `cd logicals-site && npm test -- test/outbox.test.ts test/failed-checks.test.ts && npm run build`
Expected: PASS; replaying the same stored outbox item keeps the original attempt key.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/js/results logicals-site/client/js/play logicals-site/client/js/main.js logicals-site/test
git commit -m "feat: save solo results with offline retry"
```

---

### Task 8: Implement two-player room state transitions and APIs

**Files:**
- Create: `logicals-site/worker/repositories/rooms.ts`
- Create: `logicals-site/worker/services/rooms.ts`
- Modify: `logicals-site/worker/index.ts`
- Test: `logicals-site/test/rooms.test.ts`

**Interfaces:**
- Produces `POST /api/rooms`, `POST /api/rooms/:code/join`, `POST /api/rooms/:code/loaded`, `POST /api/rooms/:code/ready`, and `GET /api/rooms/:code`.
- Produces `advanceRoom(room, members, now): RoomTransition` that assigns one immutable `startsAt = now + 4000` when both distinct members are loaded and ready.

- [ ] **Step 1: Write failing pure transition tests**

```ts
import { describe, expect, it } from 'vitest';
import { advanceRoom } from '../worker/services/rooms';

describe('duel room transitions', () => {
  it('starts once when both players are loaded and ready', () => {
    const room = { state: 'waiting', startsAt: null };
    const members = [
      { playerId: 1, loadedAt: 'x', readyAt: 'x' },
      { playerId: 2, loadedAt: 'x', readyAt: 'x' },
    ];
    expect(advanceRoom(room, members, 10_000)).toEqual({ state: 'countdown', startsAt: 14_000 });
    expect(advanceRoom({ state: 'countdown', startsAt: 14_000 }, members, 11_000)).toEqual({ state: 'countdown', startsAt: 14_000 });
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cd logicals-site && npm test -- test/rooms.test.ts`
Expected: FAIL because room services do not exist.

- [ ] **Step 3: Implement transactional room operations**

Generate codes from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` using `crypto.getRandomValues`, retrying collisions. Create rooms with a 24-hour expiry. Join only a waiting, unexpired room with no guest and a player ID different from the host. Validate the guest’s 64-character fingerprint before setting `loaded_at`. Use D1 `batch()` for membership and state changes, and preserve the first non-null `starts_at`.

Return room snapshots containing player display names, loaded/ready flags, state, startsAt, expiry, configuration, seed, puzzle index, and fingerprint, but not solution rows.

- [ ] **Step 4: Verify full, expired, duplicate-player, mismatch, and single-start cases**

Run: `cd logicals-site && npm test -- test/rooms.test.ts`
Expected: PASS for all transition fixtures and German error codes `ROOM_FULL`, `ROOM_EXPIRED`, `PLAYER_DUPLICATE`, and `PUZZLE_MISMATCH`.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/worker/repositories/rooms.ts logicals-site/worker/services/rooms.ts logicals-site/worker/index.ts logicals-site/test/rooms.test.ts
git commit -m "feat: add two-player duel rooms"
```

---

### Task 9: Add duel creation, joining, lobby, and synchronized countdown UI

**Files:**
- Modify: `logicals-site/client/index.html`
- Modify: `logicals-site/client/styles/screens.css`
- Create: `logicals-site/client/js/duel/roomApi.js`
- Create: `logicals-site/client/js/duel/duelStore.js`
- Create: `logicals-site/client/js/duel/lobbyController.js`
- Create: `logicals-site/client/js/screens/duelEntryScreen.js`
- Create: `logicals-site/client/js/screens/duelLobbyScreen.js`
- Modify: `logicals-site/client/js/screens/resultScreen.js`
- Modify: `logicals-site/client/js/main.js`
- Test: `logicals-site/test/duel-client.test.ts`

**Interfaces:**
- Produces `createDuelForPuzzle({ player, options, booklet, puzzleIndex })`.
- Produces `joinDuel({ code, player })`.
- Produces `waitForStart({ code, playerId, onSnapshot, signal }): Promise<RoomSnapshot>`.

- [ ] **Step 1: Write failing countdown and polling tests**

```ts
import { describe, expect, it, vi } from 'vitest';
import { countdownSeconds } from '../client/js/duel/duelStore';

describe('duel countdown', () => {
  it('uses the authoritative start timestamp', () => {
    expect(countdownSeconds(14_000, 10_001)).toBe(4);
    expect(countdownSeconds(14_000, 13_999)).toBe(1);
    expect(countdownSeconds(14_000, 14_000)).toBe(0);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cd logicals-site && npm test -- test/duel-client.test.ts`
Expected: FAIL because `duelStore.js` does not exist.

- [ ] **Step 3: Implement the duel screens within the existing visual system**

In duel mode, keep settings and generated puzzle cards unchanged except that “Spielen” creates a room. Render room code, share link, both player names, loaded state, ready state, and one primary Bereit button. Poll every 1000ms with an `AbortController`; after transient failure, wait 3000ms before the next request. Stop polling on screen leave.

For join links, read `?room=ABC234`, require a selected player, fetch the room, generate the exact configuration locally, select the stored puzzle index, verify the SHA-256 fingerprint, and then report loaded.

- [ ] **Step 4: Verify client state and build**

Run: `cd logicals-site && npm test -- test/duel-client.test.ts && npm run build`
Expected: PASS; direct room links survive page load and polling has one active controller.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client logicals-site/test/duel-client.test.ts
git commit -m "feat: add duel lobby and synchronized start"
```

---

### Task 10: Integrate authoritative duel timing, non-stopping cover, and comparison

**Files:**
- Modify: `logicals-site/client/js/play/playTimer.js`
- Modify: `logicals-site/client/js/play/playController.js`
- Modify: `logicals-site/client/js/play/playState.js`
- Create: `logicals-site/client/js/screens/duelResultScreen.js`
- Modify: `logicals-site/client/index.html`
- Modify: `logicals-site/client/styles/play.css`
- Test: `logicals-site/test/duel-play.test.ts`

**Interfaces:**
- Adds `createAuthoritativeTimer(startsAt, onTick)` whose `elapsedMs()` is `max(0, Date.now() - startsAt)` until stopped at completion.
- Duel `openPlay` context contains room code, startsAt, and opponent summary.

- [ ] **Step 1: Write failing duel-timer and pause tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createAuthoritativeTimer } from '../client/js/play/playTimer';

afterEach(() => vi.useRealTimers());

describe('duel timer', () => {
  it('continues while the local grid is covered', () => {
    vi.useFakeTimers();
    vi.setSystemTime(20_000);
    const timer = createAuthoritativeTimer(10_000, () => undefined);
    timer.cover();
    vi.setSystemTime(25_000);
    expect(timer.elapsedMs()).toBe(15_000);
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

Run: `cd logicals-site && npm test -- test/duel-play.test.ts`
Expected: FAIL because `createAuthoritativeTimer` does not exist.

- [ ] **Step 3: Implement duel play and final comparison**

Select the existing pausable timer for solo mode and the authoritative timer for duel mode. In duel mode, the Pause button toggles the existing locked/veiled state and collapses the clue sheet without calling timer pause or resume. Completion captures elapsed time once, queues the duel result, and polls the room until both canonical results exist.

Render one waiting state for the first finisher and one comparison screen with both names, times, failed checks, and `Gewonnen`, `Verloren`, or `Unentschieden`. Do not render live opponent progress.

- [ ] **Step 4: Verify timing, separation, and result states**

Run: `cd logicals-site && npm test -- test/duel-play.test.ts test/results.test.ts && npm run build`
Expected: PASS; covering for five seconds adds five seconds to duel elapsed time and changes no remote marks.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client logicals-site/test/duel-play.test.ts
git commit -m "feat: complete independent duel play"
```

---

### Task 11: Run iOS-focused end-to-end and regression verification

**Files:**
- Create: `logicals-site/playwright.config.ts`
- Create: `logicals-site/e2e/solo.spec.ts`
- Create: `logicals-site/e2e/duel.spec.ts`
- Create: `logicals-site/e2e/ios-layout.spec.ts`
- Modify: `logicals-site/package.json`

**Interfaces:**
- Produces repeatable Chromium/WebKit checks for the acceptance criteria; no product API changes.

- [ ] **Step 1: Write the failing two-context duel test**

```ts
import { expect, test } from '@playwright/test';

test('two devices receive the same puzzle and separate grids', async ({ browser }) => {
  const host = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guest = await browser.newContext({ viewport: { width: 834, height: 1194 } });
  const hostPage = await host.newPage();
  const guestPage = await guest.newPage();
  await hostPage.goto('/');
  await guestPage.goto('/');
  await expect(hostPage.locator('#screen-start')).toBeVisible();
  await expect(guestPage.locator('#screen-start')).toBeVisible();
});
```

- [ ] **Step 2: Run the suite and verify missing configuration or incomplete flows**

Run: `cd logicals-site && npm run test:e2e`
Expected: FAIL until Playwright configuration, local D1 preview, and full UI flows are wired.

- [ ] **Step 3: Complete the acceptance scenarios**

Cover solo completion, cached reload, offline result retry, host/guest join by code and link, fingerprint match, both-ready countdown, separate marks, first-finisher waiting, final comparison, full-room rejection, expired-room rejection, and duel cover that does not stop time.

Run layout assertions at 320×568, 390×844, 430×932, 844×390 with asymmetric 50px/0px horizontal safe-area simulation, 834×1194, 1194×834, and 1440×900. Assert no horizontal overflow, no enabled target below 44×44 CSS pixels, no form control text below 16px, no console error, no clue content visible at sheet peek, and unchanged pager/overview visibility rules.

- [ ] **Step 4: Run all verification commands**

Run: `npm test -- --runInBand && npm run build`
Expected: PASS in the root.

Run: `cd logicals-site && npm test && npm run build && npm run test:e2e`
Expected: PASS with no skipped acceptance scenario.

- [ ] **Step 5: Commit**

```bash
git add logicals-site
git commit -m "test: verify Logicals Sites multiplayer on iOS layouts"
```

---

### Task 12: Register, migrate, publish privately, and verify production

**Files:**
- Modify: `logicals-site/.openai/hosting.json` by adding the exact `project_id` returned by Sites.
- Verify: `logicals-site/dist/server/index.js`
- Verify: `logicals-site/dist/client/index.html`
- Verify: `logicals-site/dist/.openai/drizzle/0000_logicals_multiplayer.sql`

**Interfaces:**
- Produces one private deployed Sites URL and one owner-only production D1 database.

- [ ] **Step 1: Configure the execution profile and rebuild the approved source**

Run the Sites execution-profile script from `logicals-site/`, install dependencies through the Sites installer if absent, then run the Sites build helper. Confirm the Worker exports callable `fetch(request, env, ctx)` and all staged paths exist.

- [ ] **Step 2: Register exactly one Site and persist its opaque ID**

Create the Site with title `Logicals`, slug `logicals`, description `Deutsche Logikrätsel allein oder im Zwei-Spieler-Duell`, and private publication. Immediately merge the returned ID unchanged into `.openai/hosting.json`; never create a replacement Site for the same checkout.

- [ ] **Step 3: Commit and push the exact deployable source**

```bash
git add .openai/hosting.json
git commit -m "chore: register Logicals Site"
git rev-parse --verify HEAD
```

Push with the short-lived Sites source credential without storing it in the remote URL, Git configuration, or files. Package the same full commit and use its complete SHA when saving the version.

- [ ] **Step 4: Save, deploy, and verify private production behavior**

Confirm the migration applies before Worker upload, deployment reaches a terminal success state, and the live URL serves the start screen. Create two test players, complete one solo result, create and join one duel from two browser contexts, and confirm both history and comparison records survive reload.

Do not change access mode. Report that a second person requires an explicit subsequent Sites sharing instruction.

- [ ] **Step 5: Final repository commit for any deployment-owned manifest change**

```bash
git status --short
git log -1 --oneline
```

Expected: clean working tree and the deployed commit at HEAD.

---

## Final Verification Matrix

- Root generator tests and TypeScript build pass.
- Site unit tests, Worker build, and Playwright tests pass.
- Runtime generation uses the same engine package and produces stable fingerprints.
- Solo mode preserves pause and recovery behavior.
- Player creation is normalized and duplicate-safe.
- Personal history is durable and newest-first.
- Two distinct players can join one room and no third player can join.
- Both devices use one authoritative four-second start timestamp.
- Grid marks remain local and independent.
- Duel cover does not stop elapsed time.
- Result writes and offline retries are idempotent.
- The current iOS safe-area, touch, sheet, pager, dark-mode, and zoom protections remain intact.
- PDF is visibly unavailable without removing future extension boundaries.
- Production is deployed privately with no audience mutation.
