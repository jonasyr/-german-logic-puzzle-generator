# Play Sprint — Design Spec

**Status:** approved 2026-09-18 (priority order set by the owner)
**Base:** `redesign/mobile-canvas-overview` @ `c4dddf9`
**Scope:** four play-mode features, in the owner's priority order.

| # | Feature | Why it is where it is |
|---|---|---|
| 1 | Weiterspielen | Highest value, and cheaper than it looks — the machinery already exists |
| 2 | Notiz-Markierung | Small, self-contained, and it exposes an inconsistency that must be fixed with it |
| 3 | Duell: Fortschritt des Gegners | The only item that touches the database and the Worker |
| 4 | Widersprüche erkennen | Pure logic, no storage, no network — safe to land last |

---

## 1. Weiterspielen

### The constraint that shapes it

Puzzles are generated at runtime and **never stored**. `save()` in `playState.js`
persists marks under `storageKeyFor(puzzle, context)`, but nothing persists the puzzle
itself. Resuming therefore means *regenerating* it.

That is already proven to work: the duel does exactly this. `lobbyController.js:134-140`
calls `fetchBooklet(room.configuration)`, takes `booklet.puzzles[room.puzzleIndex]`, and
verifies the result with `fingerprintPuzzle()` before trusting it. Generation is
deterministic for a given configuration, and the fingerprint is the guard against that
assumption quietly breaking.

Solo play reuses that path. Nothing about the generator changes.

### What is stored

One record, for the most recent unfinished **solo** game, under
`logicals.resume.v1`:

```
{
  options,          // the exact booklet configuration passed to fetchBooklet
  puzzleIndex,      // which puzzle of the booklet
  fingerprint,      // SHA-256 of the canonical puzzle, as the duel uses
  storageKey,       // where the marks already live
  playerId,         // whose game this was
  title,            // for the button's label
  savedAt,          // ISO, for "vor 2 Stunden"
  elapsedMs,        // for the label
  markCount         // for the label
}
```

One slot, not a list. Finished games already have a home in the history screen; this is
for the one game you were in the middle of. A list would need its own management UI for a
situation that hardly arises.

Duels are excluded: they have their own session resume (`duelStore.js`), their own
expiry, and a room that may no longer exist.

### Lifecycle

- Written on every `persist()` of a solo game that has at least one mark.
- Cleared when the puzzle is solved, when `Löschen` empties the grid, and when the
  regenerated puzzle fails its fingerprint check.
- Cleared when the stored `playerId` is not the currently selected player — resuming
  someone else's game would file the result under the wrong name.

### Failure handling

Regeneration is asynchronous and can fail: no network for the generator bundle, a
generator version that produces a different booklet, a corrupt record. Every failure
path clears the record and explains itself on the start screen rather than leaving a
button that does nothing.

---

## 2. Notiz-Markierung

A third mark, `maybe`, for "probably, not certain".

### What does not change

`playLogic.evaluate()` needs **no change**. It tests explicitly for `'yes'` and `'no'`:

```js
if ((mark === 'yes' && !shouldMatch) || (mark === 'no' && shouldMatch)) wrong.add(key);
```

A `maybe` is therefore never wrong, never ticks a truth cell, and never blocks or
completes a solve. That is the correct behaviour and it falls out for free — but it is
load-bearing, so it gets a test that pins it down.

Derived crosses also need no change: they only ever fill cells that are *empty*, so a
note is protected exactly as a manual cross is.

### The inconsistency this forces us to fix

The pager still cycles on tap (`empty → × → ○ → empty`) while the overview uses the
armed-tool model. Adding a third mark makes that gap untenable: the pager would be
unable to place or clear a note at all, and a cycle of four states is worse than a cycle
of three.

So the tool bar becomes shared: both views mark through the same armed tool. This is
debt from the overview redesign being paid off, not new scope — and it is cheaper to do
here than to leave two divergent models and a mark only one of them can produce.

### Presentation

- Symbol `·`, drawn as a small dot on the canvas and as a character in the pager.
- Accessible name: `vermutet`.
- Distinct from a derived cross at a glance: notes are the player's own uncertainty,
  crosses are settled.

---

## 3. Duell: Fortschritt des Gegners

Show how many cells the opponent has filled. **Never which ones** — that would hand over
deductions.

### What has to be built

Polling stops when play starts: `startGame()` calls `stopLobby()`, which clears the
timer. There is currently no room traffic at all during a duel. So this needs its own
loop, deliberately slower than the lobby's 1 s.

This is the only item in the sprint that touches the database and the Worker.

- **Migration**: `room_members` gains `progress_filled` (integer) and `progress_at`
  (text). Additive and nullable, so an older client keeps working.
- **Route**: `POST /api/rooms/:code/progress`, authenticated with the existing member
  token, carrying only a count. The count is clamped server-side to the puzzle's cell
  count so a client cannot report nonsense.
- **Response**: `GET /api/rooms/:code` gains `filled` per member.

### Rates

Reported at most every 5 seconds, and only when the count actually changed. Polled every
5 seconds during play. A duel lasts minutes; a faster rate buys nothing and costs the
free tier.

### Privacy

The count is a number. No cell keys, no marks, no timing beyond the existing timer cross
the wire.

---

## 4. Widersprüche erkennen

`Prüfen` compares against the solution, which is why it sits behind a confirmation. This
adds a check that uses **only the player's own marks**, so it gives nothing away.

### The rules

Inside one block, for a puzzle with `V` values:

1. Two `yes` in the same row — one thing assigned twice.
2. Two `yes` in the same column.
3. A row with `V` crosses — nothing can be assigned.
4. A column with `V` crosses.

Across blocks, by transitivity:

5. `A=B` and `A=C` confirmed, but `B≠C` crossed — the three cannot all hold.

All five are decidable from the marks alone. None reveals the solution: they say *these
marks cannot all be true together*, not *this one is wrong*.

### Presentation

- A distinct colour from the red that `Prüfen` uses for genuinely wrong marks. Red means
  "this contradicts the solution"; the contradiction colour means "these contradict each
  other".
- Recomputed after every change — the worst case is 250 cells, which is nothing.
- Shown without being asked. It is not a spoiler, so it does not need a gate.

---

## Non-goals

- No change to the generator.
- No change to result scoring or attribution.
- No change to the duel start protocol or the authoritative clock.
- Notes do not participate in solving, checking, or derived crosses.
- No second resume slot, and no resume for duels.

## Acceptance

1. A solo game with marks offers `Weiterspielen` on the start screen after a reload, and
   resuming restores the same puzzle and the same marks.
2. A resume whose fingerprint does not match is refused, explained, and cleared.
3. A note can be placed and cleared in both views, survives a reload, and neither blocks
   nor completes a solve.
4. Both views mark through the same armed tool.
5. A duel shows the opponent's filled count, updating within about 10 seconds, and never
   transmits which cells.
6. Contradictions are highlighted from the player's own marks alone, in a colour distinct
   from `Prüfen`'s.
7. Everything already passing still passes: 162 generator tests, 96 site unit tests,
   26 Playwright scenarios, both typechecks, the production build.
