# Mobile Canvas Overview — Design Spec

**Status:** approved 2026-09-17
**Baseline commit:** `ee30b82d54c3c47f555f7ff54e7b01d6bff44230` on `codex/chatgpt-sites-logicals-design`
**Scope:** the full-grid overview (`Gesamtansicht`) of the play screen in `logicals-site/`.
**Explicitly out of scope:** puzzle generation, duel protocol, D1 persistence, result attribution,
the single-pair pager view, PDF output.

---

## 1. Problem

On an iPhone 13 mini the overview offers only two states, neither usable. Measured in
Chromium at 375×812 against the real app with a worst-case 5×5 puzzle:

| | fitted | at 100 % (the only markable state) |
|---|---|---|
| zoom factor | 0.286 | 1.0 |
| rendered cell | 12.58 px | 44 px |
| row label font | **3.72 px** | 13 px |
| column label font | **3.43 px** | 12 px |
| interactive | **no** (`inert`) | yes |
| visible cells | 250 / 250 | **52 / 250** |
| visible area | 100 % | **17.2 %** |

Natural content is 989 × 1028 px inside a 303 × 599 px scroller.

### 1.1 Root cause

Of the 989 px of content width, **880 px (89 %) is the 44 px cells alone.**

Two architectural mistakes produce that number:

1. **The 44 pt minimum was applied to the visible cell instead of the touch target.**
   Apple's guidance constrains the *hit area*. A `<button>` cannot separate the two — its hit
   area *is* its box. That forces 880 px, which forces zoom 0.286, which forces 3.4 px labels.
   The entire failure chain hangs on this one conflation.

2. **Labels live inside the scaled content.** They consume world width *and* shrink with the
   zoom. A label cannot simultaneously be small enough to fit and large enough to read while
   it scales with the grid.

### 1.2 Problem classification

Architectural (not fixable by CSS adjustment):

- **No coordinate system.** Position comes from table layout, scale from CSS `zoom`, offset from
  `scrollLeft/scrollTop`. `zoomedScrollPosition()` computes the anchor correctly, but `scrollLeft`
  is clamped by the browser and quantised to integers, so every gesture loses a remainder. This
  is the reported "grid looks offset after several gestures".
- **Two owners for one gesture.** A `touchmove` pinch handler on a native scroller that also has
  `touch-action: pan-x pan-y`.
- **Nested scroll containers.** page → `#grid-scroll` → (`.pager-track` → `.pair-page`) → sheet.
- **Label rendering.** `writing-mode: vertical-rl` + `rotate(180deg)` + `position: sticky` +
  CSS `zoom`, simultaneously.
- **The sub-100 % `inert` gate** (`overviewView.js:177`) is symptom treatment: the code concedes
  the view is unusable at fit scale and pays for it with the loss of the overview.

Implementation defects:

- `fit()` reads `scroller.clientHeight`, which depends on content, which depends on zoom —
  circular. Currently harmless (width is the binding constraint) but latent.
- Vertical budget: bar, toolbar, story, target question, zoom controls and hint all precede the grid.

### 1.3 Bounded problem size

`BOOKLET_LIMITS` (`src/germanBooklet.ts:342`) caps puzzles at **3–5 categories × 4–5 values**;
`CATEGORY_IDS` has exactly 5 entries. The worst case is therefore fixed: **20 × 20 slots,
10 blocks, 250 real cells.** Rendering cost is a non-issue and the geometry is fully predictable.

---

## 2. Measured feasibility

A standalone canvas prototype (world coordinates, focus-stable zoom, screen-space headers,
world-space hit testing, selection + action bar) was measured on real viewports.

**iPhone 13 mini, fitted:**

```
cell                     13.2 px
hit accuracy             250 / 250 cells, including a ±6 px finger error
zoom drift (37 gestures) 2.8e-13 px
pan drift (400 gestures) 2.8e-14 px
full redraw              0.5 ms
label size               constant 11 px at every zoom level
```

**Tap-disambiguation floor**, found by sweeping cell size rather than assumed:

```
≤ 11.5 px    0 / 250     neighbouring cell is genuinely nearer
   12.0 px   16 / 250     boundary
   12.5 px   250 / 250    floor
```

**12.5 px per cell** is the hard lower bound for unambiguous selection under a ±6 px finger
error. Below it no rendering model can help.

**Device matrix (fitted):**

| device | cell | hit | ms/frame |
|---|---|---|---|
| iPhone 13 mini portrait | 13.2 px | 250/250 | 0.49 |
| iPhone 14 portrait | 13.9 px | 250/250 | 0.47 |
| iPhone 14 Pro Max portrait | 15.8 px | 250/250 | 0.23 |
| iPad portrait | 32.4 px | 250/250 | 0.23 |
| iPad landscape | 28.7 px | 250/250 | 0.23 |
| iPad Pro 12.9 landscape | 41.2 px | 250/250 | 0.22 |
| **iPhone landscape (stacked chrome)** | **9.4 px** | **0/250** | 0.17 |
| iPhone landscape (side-mounted chrome) | 15.5 px | 250/250 | — |

Phone landscape fails only because stacked chrome consumes 46 % of the height. Moving the
action bar to the side is a verified remedy.

**Conclusion:** a true full overview with direct marking is achievable on an iPhone 13 mini.
The hybrid fallback is not required as the primary model.

---

## 3. Chosen architecture

A **canvas world viewport**, implemented as a self-contained component that replaces only the
overview. The single-pair pager stays exactly as it is.

### 3.1 Principles

1. **One coordinate system.** A world in fixed units; `{ scale, tx, ty }` is the only view state.
   No CSS `zoom`, no `scrollLeft`, no `position: sticky`.
   `screen = world * scale + t`, `world = (screen - t) / scale`.
2. **Headers in screen space.** Constant 11 px, rotated via canvas transform, never
   `writing-mode`. They occupy a fixed screen gutter, not world width.
3. **Hit testing in world space** with a screen-space tolerance, decoupled from visual cell size.
4. **Selection plus a persistent action bar.** A tap selects; the bar applies the mark. This
   satisfies both "which two values does this cell belong to" (always spelled out in full) and
   touch safety, at any zoom level.
5. **Crosshair across the entire grid** and a **minimap** placed in the empty triangular corner
   (6 of 16 block slots, 37.5 %, are structurally empty).
6. **One gesture owner.** `touch-action: none` on the viewport only; no nested scrollers.
7. **Zoom floor at 12.5 px per cell.** Below that the view pans instead of fitting — it never
   silently becomes unusable.
8. **Landscape:** action bar mounted to the side.
9. **Accessibility via a geometrically positioned sibling DOM mirror** (see §5).
10. **Game state untouched.** `playState.js` is unchanged.

### 3.2 World layout

```
CELL      = 40 world units
BLOCK_GAP = 6 world units

colX(colBlock, valueIndex) = colBlock * (V * CELL + BLOCK_GAP) + valueIndex * CELL
rowY(rowBlock, valueIndex) = rowBlock * (V * CELL + BLOCK_GAP) + valueIndex * CELL

WORLD_W = columns.length * (V * CELL + BLOCK_GAP) - BLOCK_GAP
WORLD_H = rows.length    * (V * CELL + BLOCK_GAP) - BLOCK_GAP
```

Axis derivation reuses the existing `gridAxes(count)` from `overviewView.js` unchanged:
columns are categories `1..n-1`; rows are `[0, n-1, n-2, ..., 2]`.
A block exists iff `colBlock < columns.length - rowBlock`.

### 3.3 View state and invariants

- `zoomAbout(sx, sy, factor)` must leave the world point under `(sx, sy)` fixed.
- Pan is pure translation; a round trip must be lossless.
- `fitTo(viewport)` chooses the largest scale that shows the whole world, but never below
  `MIN_CELL_PX / CELL`.
- Scale is clamped to `[fitScale, 3.0]` with a floor of `12.5 / CELL`.

---

## 4. Interaction model

| gesture | resolution |
|---|---|
| 1 pointer, moved < 10 px | tap → select nearest cell within tolerance |
| 1 pointer, moved ≥ 10 px | pan |
| 2 pointers | pinch zoom about the midpoint + two-finger pan |

- Tapping empty space clears the selection.
- The action bar shows `×` (excluded), `○` (confirmed), `␣` (clear); each ≥ 44 × 44 px.
- The readout shows both values in full plus both category names.
- The selected cell keeps a marked outline; its row and column are tinted across the whole grid.
- Existing toolbar actions (Prüfen, Undo, Pause, Löschen, view toggle) are unchanged.

### 4.1 Why the two-step model is the conforming one

A 13 px cell is smaller than Apple's 44 pt hit region and smaller than WCAG 2.2 SC 2.5.8's
24 × 24 px minimum. Two exceptions in SC 2.5.8 apply and are the formal basis for this design:

- **Essential** — "a particular presentation of the target is essential to the information being
  conveyed". A logic grid's geometry *is* the information; scaling the cells up destroys the
  relationship the player is reading.
- **Equivalent** — "the function can be achieved through a different control on the same page that
  meets this criterion". The action bar is that control, and it is 52 × 44 px.

So the tap only ever has to *identify* a cell, never to *actuate* it. Identification survives
13 px; actuation would not. This is the same decoupling that Excel and Numbers use on iPhone
(tap selects, the persistent formula bar edits) and that Sudoku apps call "cell first".

Honest framing: at fit scale the overview is a **survey and selection** surface. Sustained
marking is more comfortable zoomed in, and the design makes that one pinch away rather than a
mode change.
- The clue sheet is unchanged, but the overview no longer competes with it for gestures, since
  the viewport owns its surface outright.

---

## 5. Accessibility

Research finding: iOS VoiceOver support for `role="grid"` is recent and thin (PowerMapper:
total failure on iOS 13.3, no headers on 16.6, correct on 18.6; aggregate reliability 17 %).
`aria-rowindex` / `aria-colindex` were explicitly deferred for iOS in WebKit r190833 and are
probably silent. Canvas fallback content has an unfinished WebKit story (bug 124592, NEW since
2013). Every documented VoiceOver grid failure traces to virtualization.

Therefore:

- The canvas is `aria-hidden="true"`.
- A **sibling** DOM subtree carries `role="grid"` → `role="row"` → `role="gridcell"`,
  with a strictly pure ownership chain and **no virtualization** (441 nodes maximum).
- Mirror cells are **positioned geometrically over the painted cells** via a single container
  transform (not `visibility: hidden`, not a 1 px clip box), so VoiceOver direct-touch
  exploration lands on the correct cell.
- The transform container is updated on pan/zoom; **the accessibility tree is only mutated on
  puzzle-state change**, never on pan/zoom.
- Each cell's **accessible name carries its coordinates and state** in full, e.g.
  `"Zeile Anna, Spalte Ramen, ausgeschlossen"`, because the index attributes cannot be relied on.
- Roving `tabindex`; APG data-grid arrow-key navigation.
- A `role="status"` polite live region announces selection changes, coalesced.

---

## 6. Integration contract

`playController.js` currently holds `cellsByKey: Map<key, HTMLButtonElement[]>` and repaints by
mutating buttons. That is replaced by a small view registry:

```js
/** @typedef {{ paint(key, mark, wrong): void,
                setDisabled(disabled: boolean): void,
                destroy(): void }} PlayView */
const views = [];   // pager adapter + canvas overview
```

- `paintCell(key)` fans out to every registered view.
- The pager adapter wraps the existing button map; its behaviour is bit-for-bit unchanged.
- The canvas overview stores marks in its own render state and schedules a redraw.
- `onCellActivate(key)` keeps its exact current signature and semantics, so `cycleMark`, undo,
  failed-check recording, persistence, completion and duel submission are untouched.

---

## 7. Non-goals and constraints

- No React, no framework change. Vanilla ES modules, as today.
- No browser page-zoom suppression; `user-scalable` stays untouched.
- Safari must remain normally navigable; `touch-action: none` applies to the viewport element only.
- The single-pair pager view is not modified.
- Marks must stay synchronised between overview and pager, and survive a view switch.
- Zoom and pan state must survive a view switch and device rotation.
- No new nested scroll containers.

## 8. Acceptance criteria

1. Fitted cell size ≥ 12.5 px on iPhone 13 mini, iPhone 14, iPad portrait and landscape,
   and iPhone landscape.
2. Hit testing returns the correct cell for all 250 cells under ±6 px error, after arbitrary
   zoom and pan.
3. Zoom about a fixed point drifts < 0.01 px over 50 gestures.
4. Pan round trip is lossless.
5. No horizontal page overflow at any tested viewport.
6. A mark made in the overview appears in the pager and vice versa.
7. Undo, Prüfen, Löschen, Pause behave exactly as before.
8. Rotation preserves the selected cell and a sensible view position.
9. The existing 46 site tests, 5 e2e scenarios and 168 generator tests still pass.
10. The full two-device duel flow still completes.
