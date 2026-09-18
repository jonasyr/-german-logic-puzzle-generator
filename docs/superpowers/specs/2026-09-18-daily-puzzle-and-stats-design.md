# Daily Puzzle, a Calmer Shell, and Statistics — Design Spec

**Status:** approved 2026-09-18
**Base:** `redesign/mobile-canvas-overview` @ `ed83c96`
**Scope:** the way a player gets into a puzzle, the stability of the play screen, and a
statistics screen.

---

## 1. The problem

The app is a PDF booklet generator with a game attached, and the seams show.

Opening it and wanting to play leads to a settings form with ten fields, of which
`title`, `subtitle`, `palette`, `accent`, `secondary` and `ink` have **no effect on
playing at all** — `applyPalette` only fills three colour inputs, which travel into
`options.colors` for the PDF. The form then produces a *booklet* of up to ten puzzles, of
which exactly one is ever played. The other nine live in `state.booklet` in memory and are
gone when the tab closes.

So the three symptoms are one cause:

1. You configure a document when you want to play a game.
2. Nine tenths of the generated work is discarded, and it is noticeable.
3. Every session starts from zero configuration, so nothing carries over and there is no
   reason to come back.

## 2. What this changes

**A daily puzzle becomes the front door.** One tap, no configuration, the same puzzle for
everyone. The options screen stays as a second door for people who want a specific seed,
theme or difficulty — with the print-only fields removed.

**Volatile text stops participating in layout.** This is not defensive polish: the status
line appearing after `Prüfen` reflowed the stage and discarded the player's zoom, a bug
found and fixed during the overview redesign. The general rule prevents the class.

**A statistics screen** shows personal development and head-to-head records, computed
from results that already exist.

---

## 3. Daily puzzle

### 3.1 Derivation

```
date       = Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Berlin' }).format(now)
             → "2026-09-18"
seed       = fnv1a(date)
categories = 5
values     = 5
```

**`Europe/Berlin`, not the device timezone.** Comparability is the entire point; two
friends must not get different puzzles because one of them is travelling. The cost is that
"today" turns over at German midnight for everyone, which is the right trade for this
audience.

**The shape is fixed at 5×5** so that times mean the same thing for everyone.

The FNV-1a implementation already exists in `playState.js`, where it fingerprints clue
sets. It moves to a shared module **unchanged** — its output feeds `storageKeyFor`, and a
different hash would orphan every saved game.

### 3.2 Difficulty rotates by weekday

| Mo | Tu | We | Th | Fr | Sa | Su |
|---|---|---|---|---|---|---|
| leicht | leicht | leicht | mittel | mittel | schwer | schwer |

Crossword convention: gentler early, harder at the weekend when there is time. It is
printed on the button, so it is never a surprise, and it repeats weekly, so it is
learnable.

### 3.3 State, without a new table

A result is a daily result when its `seed` equals the daily seed for the date it was
completed on. That is decidable from the `results` rows the app already stores, so:

- **Solved today** — any result whose seed matches today's daily seed.
- **Streak** — walk back day by day from today; the streak is the run of consecutive days
  that each have at least one matching result. Today not yet solved does not break it;
  yesterday missing does.

No migration, no new endpoint.

Replaying a daily puzzle is allowed and produces a second result. Streaks count days, not
results, so a replay changes nothing about them.

### 3.4 Interaction with resume

The daily puzzle is an ordinary solo game, so the existing resume record covers it with no
special case.

---

## 4. The shell

### 4.1 Start screen

```
Rätsel des Tages                    primary
Donnerstag, 18. September · mittel  caption

Weiterspielen                       only when something is unfinished
Eigenes Rätsel
Duell beitreten
Meine Ergebnisse
Statistik                           new
```

Once today's is solved the caption becomes `Heute gelöst · 8:12 · Serie: 6 Tage` and the
button reads `Nochmal spielen`, which reopens **the same** daily puzzle — the seed is the
day's, so there is no other puzzle for it to mean. Anyone wanting a different one takes
`Eigenes Rätsel`.

When both a daily puzzle and an unfinished game are available, **`Weiterspielen` takes the
primary slot** — an interrupted puzzle is a stronger claim on attention than a fresh one,
and the existing rule already demotes `Rätsel erstellen` for the same reason.

### 4.2 The options screen loses its print fields

Removed: `title`, `subtitle`, `palette`, `accent`, `secondary`, `ink`, `puzzleCount`.

Remaining: difficulty, categories, values, theme, target category, seed.

`collectOptions()` keeps sending `colors` and `puzzleCount: 1` as constants, so the
generator contract is untouched and a later PDF path can set them again.

**Known consequence:** the e2e suites select `#field-puzzleCount` while setting a puzzle
up. Those helpers change with this, and the implementation plan must carry that rather
than discover it.

---

## 5. Layout stability

**Rule: text that comes and goes never participates in layout.**

Applies to `#play-status`, `#duel-progress`, `#start-hint` and `#resume-detail`. They are
positioned out of flow, so appearing or clearing cannot resize the stage.

This is the general form of a specific bug: `#play-status` is `display: none` when empty,
so `Prüfen` made it appear, the stage reflowed by a line, the `ResizeObserver` fired, and
the refit threw away the player's zoom. The refit now preserves zoom, but the reflow should
not happen at all.

Also in scope:

- `prefers-reduced-motion: reduce` disables transitions and the mark press animation.
- **The clock can be hidden.** Results still record the time; it is simply not displayed.
  Visible time pressure is a barrier, not a feature, for a substantial set of players.
- **Duel features can be hidden**, removing `Duell beitreten` and the duel action from the
  result screen.

Both are preferences and extend `playPrefs.js`, which already carries `autoCross`.

---

## 6. Statistics

### 6.1 Data

Computed entirely on the client from `GET /api/players/:id/results`, which already carries
`difficulty`, `elapsedMs`, `failedChecks`, `seed`, `completedAt`, `roomId` and — since the
duel history work — `opponentName`, `opponentElapsedMs` and `opponentFailedChecks`.

The calculations live in a module with no DOM, so they are unit-testable in the node
environment the rest of the suite uses.

### 6.2 What it shows

**Personal**

- Solved per difficulty, with the **median** time for each. Median, not mean: one abandoned
  evening distorts a mean beyond usefulness.
- Failed checks per puzzle, first half of the history against the second, as a trend.
- Current streak of daily puzzles.
- Total time played, best time, longest puzzle.

**Head to head, per opponent**

- Record: wins – losses – draws.
- Average margin in seconds, signed.
- Which difficulty each side is faster at.
- The last five duels as a strip.

**Failed checks sit beside time, not beneath it.** Elapsed time also measures whether
somebody went to make coffee; failed checks measure how the puzzle was actually solved.

### 6.3 Limit

The history endpoint serves at most 100 rows. Statistics therefore describe the last 100
puzzles, and the screen says so rather than implying it covers everything. Going beyond
that needs server-side aggregation, which is out of scope here.

---

## 7. Non-goals

- No booklet playlist. The booklet leaves the play path rather than being rescued.
- No drag-to-paint, no clue-to-grid linking, no hint system. All worthwhile, none part of
  this problem.
- No PDF work.
- No change to the generator, the duel protocol, result scoring or attribution.
- No new database table, column or endpoint.

## 8. Acceptance

1. Opening the app and tapping once starts today's puzzle, with no form in between.
2. Two devices in different timezones get the same daily puzzle on the same German date.
3. The daily difficulty matches the weekday table and is shown before the puzzle opens.
4. Solving today's puzzle updates the caption and the streak without a reload.
5. The options screen contains no field that has no effect on playing.
6. Making the status line appear or clear does not change the size of the grid.
7. `prefers-reduced-motion` suppresses transitions.
8. Hiding the clock keeps recording the time.
9. Statistics show medians per difficulty, a failed-check trend, a streak, and one
   head-to-head block per opponent, and state that they cover the last 100 puzzles.
10. Everything already passing still passes: 162 generator tests, 147 site unit tests,
    43 Playwright scenarios, both typechecks, the production build.
