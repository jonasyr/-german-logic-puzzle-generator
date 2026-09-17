# Mobile Canvas Overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CSS-`zoom` HTML-table overview with a canvas world viewport that shows the complete logic matrix on an iPhone 13 mini and lets the player mark any of its 250 cells directly.

**Architecture:** One world coordinate space rendered to a single `<canvas>`; `{ scale, tx, ty }` is the only view state. Headers are painted in screen space at a constant 11 px, so they never consume world width and never shrink. Hit testing runs in world space with a screen-space tolerance, which decouples the touch target from the visual cell and removes the 880 px width floor. A tap selects a cell; a persistent action bar applies the mark. Accessibility is served by a geometrically positioned sibling DOM grid, not by canvas fallback content.

**Tech Stack:** Vanilla ES modules, Canvas 2D, Pointer Events, Vitest 4 (node environment, no DOM), Playwright 1.55, Vite 8.

**Spec:** `docs/superpowers/specs/2026-09-17-mobile-canvas-overview-design.md`

## Global Constraints

- Baseline commit `ee30b82d54c3c47f555f7ff54e7b01d6bff44230`; branch `redesign/mobile-canvas-overview`.
- Do not modify `client/js/play/playState.js`, `playTimer.js`, the duel modules, the worker, or `db/`.
- Do not modify the single-pair pager (`client/js/play/matrixView.js`) or its CSS.
- No React, no framework change. Vanilla ES modules only.
- Never set `user-scalable=no` or `maximum-scale`; the viewport meta tag stays exactly as it is.
- `touch-action: none` applies to the canvas viewport element **only**. `body` keeps its existing
  `touch-action: manipulation`. Because `touch-action` is intersected across ancestors up to the
  scrolling container, this claims pinch and pan on the viewport without affecting the rest of
  the page.
- `touch-action: none` also has to be paired with cancelling WebKit's `gesturestart` /
  `gesturechange` / `gestureend`; the CSS property alone does not suppress Safari's page pinch.
- Never read `event.scale` from those gesture events on iOS — they fire alongside the pointer
  events for the same pinch, and acting on both produces conflicting state.
- `getCoalescedEvents()` is not Baseline; do not depend on it.
- Canvas hairlines must be snapped in **device** pixels, not with a naive `+0.5` — at DPR 3 half
  a CSS pixel is 1.5 device pixels.
- `ctx.textRendering`, `fontKerning` and `fontStretch` are unsupported in Safari; do not use them.
- No new nested scroll containers.
- The Vitest environment is **node, with no DOM**. Unit tests cover pure modules only; anything touching the DOM is covered by Playwright.
- `MIN_CELL_PX = 12.5`, `CELL = 40`, `BLOCK_GAP = 6`, `MAX_SCALE = 3`.
- Commit messages contain only the message — no `Co-Authored-By`, no tool footer, no emoji.
- Run `npm ci --ignore-scripts` in `logicals-site/` (plain `npm ci` fails on `sharp` under Node 25).
- Do not touch the ChatGPT Site. Publishing is a separate, later step requiring explicit approval.

---

## File Structure

**Create**
- `logicals-site/client/js/play/overview/geometry.js` — world layout and hit testing. Pure.
- `logicals-site/client/js/play/overview/viewport.js` — transform maths. Pure.
- `logicals-site/client/js/play/overview/gestures.js` — pointer arbitration as a pure reducer, plus a thin DOM binder.
- `logicals-site/client/js/play/overview/renderer.js` — all canvas painting.
- `logicals-site/client/js/play/overview/a11yMirror.js` — sibling `role="grid"` DOM mirror.
- `logicals-site/client/js/play/overview/overviewCanvas.js` — component wiring; exposes the `PlayView` interface.
- `logicals-site/test/overview-geometry.test.ts`
- `logicals-site/test/overview-viewport.test.ts`
- `logicals-site/test/overview-gestures.test.ts`
- `logicals-site/e2e/overview-canvas.spec.ts`

**Modify**
- `logicals-site/client/js/play/playController.js` — view registry instead of `cellsByKey` button arrays.
- `logicals-site/client/index.html` — overview markup: canvas, mirror host, readout, action bar.
- `logicals-site/client/styles/play.css` — viewport, action bar, landscape side-mount.
- `logicals-site/e2e/solo.spec.ts` — assertions that referenced `#grid-zoom` / `zoom-level` / `data-interactive`.

**Delete**
- `logicals-site/client/js/play/overviewView.js` — superseded. `gridAxes` moves to `geometry.js`.
- `logicals-site/test/overview-zoom.test.ts` — tests `fitZoom` / `clampZoom` / `zoomedScrollPosition`, all removed. Replaced by the three new unit suites, which cover strictly more.

---

### Task 1: World geometry and hit testing

**Files:**
- Create: `logicals-site/client/js/play/overview/geometry.js`
- Test: `logicals-site/test/overview-geometry.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `CELL = 40`, `BLOCK_GAP = 6`, `MIN_CELL_PX = 12.5`
  - `gridAxes(count) -> { columns: number[], rows: number[] }`
  - `blockVisible(rowBlock, colBlock, columnCount) -> boolean`
  - `createLayout(puzzle, cellKey) -> { columns, rows, valueCount, width, height, cells }`
    where each cell is `{ key, rowBlock, rowValue, colBlock, colValue, rowCategoryIndex, colCategoryIndex, x, y }` and `x`/`y` are the cell's top-left world coordinates.
  - `hitTest(layout, worldX, worldY, scale, tolerancePx) -> cell | null`

- [ ] **Step 1: Write the failing test**

```ts
// logicals-site/test/overview-geometry.test.ts
import { describe, expect, it } from 'vitest';
import {
  CELL, BLOCK_GAP, MIN_CELL_PX, gridAxes, blockVisible, createLayout, hitTest,
} from '../client/js/play/overview/geometry';

const cellKey = (rc: number, rv: number, cc: number, cv: number) => `${rc}.${cc}.${rv}.${cv}`;

function puzzleOf(categoryCount: number, valueCount: number) {
  return {
    categories: Array.from({ length: categoryCount }, (_, c) => ({
      label: `K${c}`,
      values: Array.from({ length: valueCount }, (_, v) => `v${c}${v}`),
    })),
  };
}

describe('overview geometry', () => {
  it('derives the same axes as the table overview did', () => {
    expect(gridAxes(5)).toEqual({ columns: [1, 2, 3, 4], rows: [0, 4, 3, 2] });
    expect(gridAxes(3)).toEqual({ columns: [1, 2], rows: [0, 2] });
  });

  it('keeps only the triangular half of the block matrix', () => {
    expect(blockVisible(0, 3, 4)).toBe(true);
    expect(blockVisible(1, 3, 4)).toBe(false);
    expect(blockVisible(3, 0, 4)).toBe(true);
    expect(blockVisible(3, 1, 4)).toBe(false);
  });

  it('builds exactly the 250 cells of a worst-case 5x5 puzzle', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    expect(layout.cells).toHaveLength(250);
    expect(new Set(layout.cells.map(c => c.key)).size).toBe(250);
    expect(layout.width).toBe(4 * (5 * CELL + BLOCK_GAP) - BLOCK_GAP);
    expect(layout.height).toBe(4 * (5 * CELL + BLOCK_GAP) - BLOCK_GAP);
  });

  it('builds the smallest supported puzzle too', () => {
    const layout = createLayout(puzzleOf(3, 4), cellKey);
    expect(layout.cells).toHaveLength(3 * 4 * 4);
    expect(layout.valueCount).toBe(4);
  });

  it('places blocks on a gapped lattice', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    const first = layout.cells.find(c => c.rowBlock === 0 && c.colBlock === 0 && c.rowValue === 0 && c.colValue === 0)!;
    const second = layout.cells.find(c => c.rowBlock === 0 && c.colBlock === 1 && c.rowValue === 0 && c.colValue === 0)!;
    expect(first.x).toBe(0);
    expect(second.x).toBe(5 * CELL + BLOCK_GAP);
  });

  it('hits the cell under the point at every cell centre', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    for (const cell of layout.cells) {
      const hit = hitTest(layout, cell.x + CELL / 2, cell.y + CELL / 2, 1, 22);
      expect(hit?.key).toBe(cell.key);
    }
  });

  it('still hits the right cell through a +/-6px finger error at the 12.5px floor', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    const scale = MIN_CELL_PX / CELL;
    const offsets = [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, -4]];
    for (const cell of layout.cells) {
      for (const [dx, dy] of offsets) {
        const hit = hitTest(layout, cell.x + CELL / 2 + dx / scale, cell.y + CELL / 2 + dy / scale, scale, 22);
        expect(hit?.key).toBe(cell.key);
      }
    }
  });

  it('returns null well outside the grid', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    expect(hitTest(layout, -500, -500, 1, 22)).toBeNull();
  });

  it('returns null inside the empty triangular corner', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    // Bottom-right block slot (rowBlock 3, colBlock 3) is structurally empty.
    const x = 3 * (5 * CELL + BLOCK_GAP) + 2 * CELL;
    const y = 3 * (5 * CELL + BLOCK_GAP) + 2 * CELL;
    expect(hitTest(layout, x, y, 1, 0)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/overview-geometry.test.ts`
Expected: FAIL — cannot resolve `../client/js/play/overview/geometry`.

- [ ] **Step 3: Write the implementation**

```js
// logicals-site/client/js/play/overview/geometry.js
/**
 * World layout for the overview.
 *
 * Everything here is in world units and independent of zoom: the viewport
 * transform is the only thing that turns these into pixels. That separation is
 * the whole point - the old table overview derived position from table layout,
 * scale from CSS `zoom` and offset from scrollLeft, and those three could not
 * be kept in agreement.
 */

/** World units per cell. Arbitrary but fixed; only ratios matter. */
export const CELL = 40;

/** World units between two 5x5 blocks. */
export const BLOCK_GAP = 6;

/**
 * Smallest visual cell at which a tap can still be attributed unambiguously.
 * Measured, not assumed: below 12.5px a +/-6px finger error puts the
 * neighbouring cell genuinely nearer, and no hit-testing scheme can recover
 * from that. See the design spec for the sweep.
 */
export const MIN_CELL_PX = 12.5;

/** Column blocks run over categories 1..n-1, rows over the first and then the rest. */
export function gridAxes(count) {
    const columns = [];
    for (let index = 1; index < count; index++) columns.push(index);
    const rows = [0];
    for (let index = count - 1; index >= 2; index--) rows.push(index);
    return { columns, rows };
}

/** The grid is triangular: each row block drops one column block. */
export function blockVisible(rowBlock, colBlock, columnCount) {
    return colBlock < columnCount - rowBlock;
}

function blockOrigin(block, valueCount) {
    return block * (valueCount * CELL + BLOCK_GAP);
}

export function createLayout(puzzle, cellKey) {
    const { columns, rows } = gridAxes(puzzle.categories.length);
    const valueCount = puzzle.categories[0].values.length;
    const cells = [];

    rows.forEach((rowCategoryIndex, rowBlock) => {
        columns.forEach((colCategoryIndex, colBlock) => {
            if (!blockVisible(rowBlock, colBlock, columns.length)) return;
            for (let rowValue = 0; rowValue < valueCount; rowValue++) {
                for (let colValue = 0; colValue < valueCount; colValue++) {
                    cells.push({
                        key: cellKey(rowCategoryIndex, rowValue, colCategoryIndex, colValue),
                        rowBlock, rowValue, colBlock, colValue,
                        rowCategoryIndex, colCategoryIndex,
                        x: blockOrigin(colBlock, valueCount) + colValue * CELL,
                        y: blockOrigin(rowBlock, valueCount) + rowValue * CELL,
                    });
                }
            }
        });
    });

    const span = block => blockOrigin(block, valueCount) + valueCount * CELL;
    return {
        columns, rows, valueCount, cells,
        width: span(columns.length - 1),
        height: span(rows.length - 1),
    };
}

/**
 * Nearest cell to a world point, accepted only if the point is within the cell
 * or within `tolerancePx` SCREEN pixels of it.
 *
 * The tolerance is measured on screen rather than in world units, which is what
 * makes a 13px cell as tappable as a 44px one: the visual size shrinks with the
 * zoom, the finger does not.
 */
export function hitTest(layout, worldX, worldY, scale, tolerancePx) {
    let best = null;
    let bestDistance = Infinity;

    for (const cell of layout.cells) {
        const dx = worldX - (cell.x + CELL / 2);
        const dy = worldY - (cell.y + CELL / 2);
        const distance = Math.hypot(dx, dy);
        if (distance < bestDistance) { bestDistance = distance; best = cell; }
    }
    if (!best) return null;

    // Half a cell of "inside", plus the finger slop, both in screen pixels.
    const reach = (CELL / 2) * scale + tolerancePx;
    return bestDistance * scale <= reach ? best : null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd logicals-site && npx vitest run --root . test/overview-geometry.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/js/play/overview/geometry.js logicals-site/test/overview-geometry.test.ts
git commit -m "feat(overview): add world geometry and zoom-independent hit testing"
```

---

### Task 2: Viewport transform

**Files:**
- Create: `logicals-site/client/js/play/overview/viewport.js`
- Test: `logicals-site/test/overview-viewport.test.ts`

**Interfaces:**
- Consumes: `CELL`, `MIN_CELL_PX` from `geometry.js`.
- Produces (all pure; every function returns a new view, none mutates):
  - `MAX_SCALE = 3`
  - `worldToScreen(view, wx, wy) -> { x, y }`
  - `screenToWorld(view, sx, sy) -> { x, y }`
  - `minScaleFor(minCellPx) -> number`
  - `fitView({ worldWidth, worldHeight, viewWidth, viewHeight, gutterLeft, gutterTop, padding }) -> view`
  - `zoomAbout(view, screenX, screenY, factor, { minScale, maxScale }) -> view`
  - `zoomTo(view, screenX, screenY, targetScale, { minScale, maxScale }) -> view`

**Why `zoomTo` exists as well as `zoomAbout`.** A pinch must be driven by the ratio *since the
gesture started* (`initialScale × distance / initialDistance`), not by a per-frame factor. The
per-frame form is not idempotent: once the scale clamps at the floor or the ceiling, the
accumulated per-frame factors no longer correspond to the finger spread, and the gesture stays
permanently desynchronised for the rest of the pinch. d3-zoom, tldraw and Excalidraw all use the
ratio-since-start form. `zoomAbout` remains for the discrete cases (double-tap, wheel).
  - `panBy(view, dx, dy) -> view`
  - `clampView(view, { worldWidth, worldHeight, viewWidth, viewHeight, gutterLeft, gutterTop, minVisible }) -> view`

  A `view` is `{ scale, tx, ty }` and `screen = world * scale + t`.

- [ ] **Step 1: Write the failing test**

```ts
// logicals-site/test/overview-viewport.test.ts
import { describe, expect, it } from 'vitest';
import { CELL, MIN_CELL_PX } from '../client/js/play/overview/geometry';
import {
  MAX_SCALE, worldToScreen, screenToWorld, minScaleFor,
  fitView, zoomAbout, zoomTo, panBy, clampView,
} from '../client/js/play/overview/viewport';

const BOUNDS = {
  worldWidth: 818, worldHeight: 818,
  viewWidth: 359, viewHeight: 620,
  gutterLeft: 78, gutterTop: 46, padding: 6,
};
const LIMITS = { minScale: minScaleFor(MIN_CELL_PX), maxScale: MAX_SCALE };

describe('overview viewport', () => {
  it('round-trips world and screen coordinates', () => {
    const view = { scale: 0.37, tx: 91, ty: 52 };
    const screen = worldToScreen(view, 123, 456);
    const world = screenToWorld(view, screen.x, screen.y);
    expect(world.x).toBeCloseTo(123, 10);
    expect(world.y).toBeCloseTo(456, 10);
  });

  it('derives the minimum scale from the measured cell floor', () => {
    expect(minScaleFor(MIN_CELL_PX)).toBeCloseTo(12.5 / CELL, 10);
  });

  it('fits the whole world inside the area left over by the gutters', () => {
    const view = fitView(BOUNDS);
    const topLeft = worldToScreen(view, 0, 0);
    const bottomRight = worldToScreen(view, BOUNDS.worldWidth, BOUNDS.worldHeight);
    expect(topLeft.x).toBeGreaterThanOrEqual(BOUNDS.gutterLeft - 0.001);
    expect(topLeft.y).toBeGreaterThanOrEqual(BOUNDS.gutterTop - 0.001);
    expect(bottomRight.x).toBeLessThanOrEqual(BOUNDS.viewWidth + 0.001);
    expect(bottomRight.y).toBeLessThanOrEqual(BOUNDS.viewHeight + 0.001);
  });

  it('never fits below the tap-disambiguation floor', () => {
    // A viewport far too small to show the whole grid at a usable cell size.
    const view = fitView({ ...BOUNDS, viewWidth: 200, viewHeight: 200 });
    expect(view.scale * CELL).toBeGreaterThanOrEqual(MIN_CELL_PX - 1e-9);
  });

  it('keeps the world point under the focus exactly fixed while zooming', () => {
    let view = fitView(BOUNDS);
    const focus = { x: 240, y: 300 };
    const before = screenToWorld(view, focus.x, focus.y);
    for (let i = 0; i < 25; i++) view = zoomAbout(view, focus.x, focus.y, 1.06, LIMITS);
    for (let i = 0; i < 25; i++) view = zoomAbout(view, focus.x, focus.y, 0.94, LIMITS);
    const after = screenToWorld(view, focus.x, focus.y);
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.01);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.01);
  });

  it('clamps the scale to the floor and the ceiling', () => {
    const view = fitView(BOUNDS);
    const tiny = zoomAbout(view, 100, 100, 0.001, LIMITS);
    expect(tiny.scale).toBeCloseTo(LIMITS.minScale, 10);
    const huge = zoomAbout(view, 100, 100, 1000, LIMITS);
    expect(huge.scale).toBeCloseTo(MAX_SCALE, 10);
  });

  it('pans losslessly over a long round trip', () => {
    const start = fitView(BOUNDS);
    let view = start;
    for (let i = 0; i < 200; i++) view = panBy(view, 3.7, -2.3);
    for (let i = 0; i < 200; i++) view = panBy(view, -3.7, 2.3);
    expect(Math.abs(view.tx - start.tx)).toBeLessThan(1e-9);
    expect(Math.abs(view.ty - start.ty)).toBeLessThan(1e-9);
    expect(view.scale).toBe(start.scale);
  });

  it('never lets the grid be panned entirely off screen', () => {
    const view = clampView(panBy(fitView(BOUNDS), 100000, 100000), { ...BOUNDS, minVisible: 60 });
    expect(view.tx).toBeLessThanOrEqual(BOUNDS.viewWidth - 60 + 0.001);
    expect(view.ty).toBeLessThanOrEqual(BOUNDS.viewHeight - 60 + 0.001);
  });

  it('recovers exactly after a pinch runs into the zoom ceiling and comes back', () => {
    // The per-frame-factor form fails this: once the scale clamps, the factors
    // no longer correspond to the finger spread and never recover.
    const start = fitView(BOUNDS);
    const focus = { x: 200, y: 260 };
    const spreads = [1, 4, 20, 60, 20, 4, 1];   // far past the ceiling and back
    let view = start;
    for (const spread of spreads) {
      view = zoomTo(view, focus.x, focus.y, start.scale * spread, LIMITS);
    }
    expect(view.scale).toBeCloseTo(start.scale, 10);
    expect(view.tx).toBeCloseTo(start.tx, 8);
    expect(view.ty).toBeCloseTo(start.ty, 8);
  });

  it('keeps the focus fixed while zooming to an absolute scale', () => {
    const view = fitView(BOUNDS);
    const focus = { x: 180, y: 240 };
    const before = screenToWorld(view, focus.x, focus.y);
    const zoomed = zoomTo(view, focus.x, focus.y, view.scale * 2.5, LIMITS);
    const after = screenToWorld(zoomed, focus.x, focus.y);
    expect(after.x).toBeCloseTo(before.x, 8);
    expect(after.y).toBeCloseTo(before.y, 8);
  });

  it('does not mutate the view it is given', () => {
    const view = Object.freeze({ scale: 0.4, tx: 10, ty: 20 });
    expect(() => panBy(view, 5, 5)).not.toThrow();
    expect(() => zoomAbout(view, 1, 1, 1.1, LIMITS)).not.toThrow();
    expect(view).toEqual({ scale: 0.4, tx: 10, ty: 20 });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/overview-viewport.test.ts`
Expected: FAIL — cannot resolve `../client/js/play/overview/viewport`.

- [ ] **Step 3: Write the implementation**

```js
// logicals-site/client/js/play/overview/viewport.js
/**
 * The view transform: screen = world * scale + t.
 *
 * Every function is pure and returns a new view. That is deliberate - the old
 * overview kept its offset in `scrollLeft`, which the browser clamps and rounds
 * to whole pixels, so each gesture lost a remainder and the grid slowly drifted
 * out of alignment. A plain float pair has no such behaviour.
 */

import { CELL } from './geometry.js';

export const MAX_SCALE = 3;

export function worldToScreen(view, worldX, worldY) {
    return { x: worldX * view.scale + view.tx, y: worldY * view.scale + view.ty };
}

export function screenToWorld(view, screenX, screenY) {
    return { x: (screenX - view.tx) / view.scale, y: (screenY - view.ty) / view.scale };
}

/** The scale at which one cell is exactly `minCellPx` pixels wide. */
export function minScaleFor(minCellPx) {
    return minCellPx / CELL;
}

/**
 * Largest scale that shows the whole world inside the area the gutters leave
 * over - but never smaller than the tap floor. Below that floor the grid is
 * panned instead of fitted; silently becoming unmarkable is what the old
 * `inert` gate did, and it cost the overview its purpose.
 */
export function fitView({
    worldWidth, worldHeight, viewWidth, viewHeight, gutterLeft, gutterTop, padding = 0,
}) {
    const availableWidth = Math.max(1, viewWidth - gutterLeft - padding * 2);
    const availableHeight = Math.max(1, viewHeight - gutterTop - padding * 2);
    const scale = Math.max(
        minScaleFor(12.5),
        Math.min(MAX_SCALE, availableWidth / worldWidth, availableHeight / worldHeight),
    );
    return {
        scale,
        tx: gutterLeft + padding + Math.max(0, (availableWidth - worldWidth * scale) / 2),
        ty: gutterTop + padding + Math.max(0, (availableHeight - worldHeight * scale) / 2),
    };
}

/** Zoom about a fixed screen point; the world point under it does not move. */
export function zoomAbout(view, screenX, screenY, factor, { minScale, maxScale }) {
    const scale = Math.max(minScale, Math.min(maxScale, view.scale * factor));
    const ratio = scale / view.scale;
    return {
        scale,
        tx: screenX - (screenX - view.tx) * ratio,
        ty: screenY - (screenY - view.ty) * ratio,
    };
}

/**
 * Zoom about a fixed screen point to an ABSOLUTE target scale.
 *
 * This is the one a pinch must use. Driving a pinch with per-frame factors is
 * not idempotent: as soon as the scale clamps at the floor or the ceiling, the
 * accumulated factors stop matching the finger spread and the gesture stays out
 * of step for the rest of the pinch. Feeding an absolute target derived from
 * `initialScale * distance / initialDistance` makes clamping harmless.
 */
export function zoomTo(view, screenX, screenY, targetScale, { minScale, maxScale }) {
    const scale = Math.max(minScale, Math.min(maxScale, targetScale));
    const ratio = scale / view.scale;
    return {
        scale,
        tx: screenX - (screenX - view.tx) * ratio,
        ty: screenY - (screenY - view.ty) * ratio,
    };
}

export function panBy(view, dx, dy) {
    return { scale: view.scale, tx: view.tx + dx, ty: view.ty + dy };
}

/** Keeps at least `minVisible` pixels of the grid on screen in each direction. */
export function clampView(view, {
    worldWidth, worldHeight, viewWidth, viewHeight, gutterLeft, gutterTop, minVisible = 60,
}) {
    const width = worldWidth * view.scale;
    const height = worldHeight * view.scale;
    return {
        scale: view.scale,
        tx: Math.min(viewWidth - minVisible, Math.max(gutterLeft - width + minVisible, view.tx)),
        ty: Math.min(viewHeight - minVisible, Math.max(gutterTop - height + minVisible, view.ty)),
    };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd logicals-site && npx vitest run --root . test/overview-viewport.test.ts`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/js/play/overview/viewport.js logicals-site/test/overview-viewport.test.ts
git commit -m "feat(overview): add pure viewport transform with focus-stable zoom"
```

---

### Task 3: Gesture arbitration

**Files:**
- Create: `logicals-site/client/js/play/overview/gestures.js`
- Test: `logicals-site/test/overview-gestures.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `MOVE_SLOP = 10`
  - `createGestureState() -> state`
  - `reduce(state, event) -> { state, action }` — pure.
    `event` is `{ type: 'down' | 'move' | 'up' | 'cancel', id, x, y }`.
    `action` is `null`, `{ type: 'tap', x, y }`, `{ type: 'pan', dx, dy }`,
    `{ type: 'pinchstart' }`, or
    `{ type: 'pinch', centerX, centerY, scaleFromStart, dx, dy }`.
    `scaleFromStart` is measured against the distance captured when the second
    pointer landed, never against the previous frame.
  - `bindGestures(element, handlers) -> () => void` — thin DOM binder that feeds
    pointer events through `reduce` and calls `handlers.onTap / onPan / onPinch`.
    Returns an unbind function.
  - `suppressNativeZoom(element) -> () => void` — cancels WebKit's proprietary
    `gesturestart` / `gesturechange` / `gestureend`.

**Why `suppressNativeZoom` is not optional.** `touch-action: none` does **not** by itself
suppress WebKit's own page pinch-zoom; the proprietary gesture events must be cancelled too, and
a passive listener cannot cancel, so they must be registered `{ passive: false }`
(Apple, *Handling Events*). Two documented traps: `event.cancelable` must be checked before
`preventDefault()`, and `gestureend` can fire twice, so it needs a latch (danburzo.ro/dom-gestures).
Their `event.scale` is deliberately **not** used — tldraw ships
`const useGestureEvents = !tlenv.isIos && 'GestureEvent' in window` with the comment *"On iOS
Safari, both event types fire for the same pinch gesture, causing conflicting state updates"*, and
Excalidraw bails from `onGestureChange` on touch devices for the same reason. We cancel them and
do our own two-pointer maths. Safari's "pinch to show all tabs" fires anyway when the user
combines scale with rotation and cannot be suppressed; that is a known, accepted limit.

- [ ] **Step 1: Write the failing test**

```ts
// logicals-site/test/overview-gestures.test.ts
import { describe, expect, it } from 'vitest';
import { createGestureState, reduce, MOVE_SLOP } from '../client/js/play/overview/gestures';

type Ev = { type: 'down' | 'move' | 'up' | 'cancel'; id: number; x: number; y: number };

function run(events: Ev[]) {
  let state = createGestureState();
  const actions: any[] = [];
  for (const event of events) {
    const next = reduce(state, event);
    state = next.state;
    if (next.action) actions.push(next.action);
  }
  return { state, actions };
}

describe('overview gesture arbitration', () => {
  it('treats a still press and release as a tap', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 100 },
      { type: 'up', id: 1, x: 102, y: 101 },
    ]);
    expect(actions).toEqual([{ type: 'tap', x: 102, y: 101 }]);
  });

  it('turns a drag past the slop into a pan and suppresses the tap', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 100 },
      { type: 'move', id: 1, x: 100 + MOVE_SLOP + 5, y: 100 },
      { type: 'up', id: 1, x: 100 + MOVE_SLOP + 5, y: 100 },
    ]);
    expect(actions.some(a => a.type === 'pan')).toBe(true);
    expect(actions.some(a => a.type === 'tap')).toBe(false);
  });

  it('reports pan deltas relative to the previous position', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 100 },
      { type: 'move', id: 1, x: 130, y: 90 },
      { type: 'move', id: 1, x: 140, y: 95 },
    ]);
    const pans = actions.filter(a => a.type === 'pan');
    expect(pans[0]).toEqual({ type: 'pan', dx: 30, dy: -10 });
    expect(pans[1]).toEqual({ type: 'pan', dx: 10, dy: 5 });
  });

  it('switches to pinch on a second pointer and never emits a tap afterwards', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },
      { type: 'move', id: 2, x: 300, y: 200 },
      { type: 'up', id: 2, x: 300, y: 200 },
      { type: 'up', id: 1, x: 100, y: 200 },
    ]);
    const pinches = actions.filter(a => a.type === 'pinch');
    expect(pinches).toHaveLength(1);
    expect(pinches[0].scaleFromStart).toBeCloseTo(2, 5);
    expect(actions.some(a => a.type === 'pinchstart')).toBe(true);
    expect(actions.some(a => a.type === 'tap')).toBe(false);
  });

  it('measures the pinch against the gesture start, not the previous frame', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },   // start distance 100
      { type: 'move', id: 2, x: 300, y: 200 },   // 200 -> 2.0
      { type: 'move', id: 2, x: 400, y: 200 },   // 300 -> 3.0, not 1.5
      { type: 'move', id: 2, x: 250, y: 200 },   // 150 -> 1.5
    ]);
    const ratios = actions.filter(a => a.type === 'pinch').map(a => a.scaleFromStart);
    expect(ratios[0]).toBeCloseTo(2, 5);
    expect(ratios[1]).toBeCloseTo(3, 5);
    expect(ratios[2]).toBeCloseTo(1.5, 5);
  });

  it('floors the pinch distance so touching fingers cannot explode the ratio', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 100, y: 200 },   // identical points
      { type: 'move', id: 2, x: 150, y: 200 },
    ]);
    const pinch = actions.filter(a => a.type === 'pinch').pop();
    expect(Number.isFinite(pinch.scaleFromStart)).toBe(true);
    expect(pinch.scaleFromStart).toBeCloseTo(50, 5);
  });

  it('reports the midpoint translation as part of the pinch', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 100 },
      { type: 'down', id: 2, x: 200, y: 100 },
      { type: 'move', id: 1, x: 110, y: 120 },
      { type: 'move', id: 2, x: 210, y: 120 },
    ]);
    const pinch = actions.filter(a => a.type === 'pinch').pop();
    expect(pinch.scaleFromStart).toBeCloseTo(1, 5);
    expect(pinch.dx).toBeCloseTo(10, 5);
    expect(pinch.dy).toBeCloseTo(20, 5);
  });

  it('re-seeds from the surviving finger when one of two lifts', () => {
    // The first move after the lift must be measured from that finger's own
    // last position, not from the midpoint that no longer exists.
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },
      { type: 'up', id: 2, x: 200, y: 200 },
      { type: 'move', id: 1, x: 130, y: 210 },
    ]);
    const pan = actions.filter(a => a.type === 'pan').pop();
    expect(pan).toEqual({ type: 'pan', dx: 30, dy: 10 });
  });

  it('drops the whole gesture on cancel', () => {
    const { actions, state } = run([
      { type: 'down', id: 1, x: 100, y: 100 },
      { type: 'cancel', id: 1, x: 100, y: 100 },
    ]);
    expect(actions).toEqual([]);
    expect(state.pointers.size).toBe(0);
  });

  it('does not emit a tap for the second finger lifting after a pinch', () => {
    const { actions } = run([
      { type: 'down', id: 1, x: 100, y: 200 },
      { type: 'down', id: 2, x: 200, y: 200 },
      { type: 'up', id: 1, x: 100, y: 200 },
      { type: 'up', id: 2, x: 200, y: 200 },
    ]);
    expect(actions.some(a => a.type === 'tap')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd logicals-site && npx vitest run --root . test/overview-gestures.test.ts`
Expected: FAIL — cannot resolve `../client/js/play/overview/gestures`.

- [ ] **Step 3: Write the implementation**

```js
// logicals-site/client/js/play/overview/gestures.js
/**
 * Gesture arbitration for the overview viewport.
 *
 * The recogniser is a pure reducer so it can be tested without a DOM; the
 * binder underneath it is deliberately thin. One surface owns all three
 * gestures, which is the point: the old overview ran a touchmove pinch on top
 * of a native scroller that was also claiming pan-x/pan-y, so two mechanisms
 * fought over every gesture.
 */

/** Past this much movement a press is a pan, not a tap. */
export const MOVE_SLOP = 10;

export function createGestureState() {
    return {
        pointers: new Map(),
        /** Set once a second finger lands; blocks the tap for the whole gesture. */
        multiTouch: false,
        moved: false,
        origin: null,
        pinch: null,
    };
}

function midpoint(pointers) {
    const [a, b] = [...pointers.values()];
    return {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        // Floored at 1: two fingers touching each other report a near-zero
        // distance, which makes the ratio explode.
        distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
    };
}

export function reduce(state, event) {
    const pointers = new Map(state.pointers);

    if (event.type === 'down') {
        pointers.set(event.id, { x: event.x, y: event.y });
        const multiTouch = state.multiTouch || pointers.size > 1;
        // The reference distance is captured on the TRANSITION to two pointers,
        // not on the first pointerdown - a second finger landing late is a
        // well-known source of a jumping canvas.
        const started = pointers.size === 2;
        const pinch = started
            ? { ...midpoint(pointers), startDistance: midpoint(pointers).distance }
            : state.pinch;
        return {
            state: {
                ...state, pointers, multiTouch, pinch,
                moved: state.moved,
                origin: pointers.size === 1 ? { x: event.x, y: event.y } : state.origin,
            },
            action: started ? { type: 'pinchstart' } : null,
        };
    }

    if (event.type === 'move') {
        const previous = pointers.get(event.id);
        if (!previous) return { state, action: null };
        pointers.set(event.id, { x: event.x, y: event.y });

        if (pointers.size >= 2 && state.pinch) {
            const next = midpoint(pointers);
            return {
                state: {
                    ...state, pointers, moved: true,
                    // startDistance is carried through untouched; only the
                    // midpoint moves frame to frame.
                    pinch: { ...next, startDistance: state.pinch.startDistance },
                },
                action: {
                    type: 'pinch',
                    centerX: next.x, centerY: next.y,
                    scaleFromStart: next.distance / state.pinch.startDistance,
                    dx: next.x - state.pinch.x,
                    dy: next.y - state.pinch.y,
                },
            };
        }

        const moved = state.moved
            || (state.origin
                ? Math.hypot(event.x - state.origin.x, event.y - state.origin.y) > MOVE_SLOP
                : true);
        return {
            state: { ...state, pointers, moved },
            action: { type: 'pan', dx: event.x - previous.x, dy: event.y - previous.y },
        };
    }

    // 'up' and 'cancel'
    pointers.delete(event.id);
    const wasLast = pointers.size === 0;
    const isTap = event.type === 'up' && wasLast && !state.multiTouch && !state.moved;

    // Dropping from two pointers to one re-seeds the survivor: its stored
    // position is its last real one, so the next pan delta is measured from the
    // finger rather than from the vanished midpoint. Without this the view
    // jumps by the midpoint-to-finger offset the moment a finger lifts.
    const next = wasLast
        ? createGestureState()
        : { ...state, pointers, pinch: null, moved: true };

    return { state: next, action: isTap ? { type: 'tap', x: event.x, y: event.y } : null };
}

/**
 * Feeds pointer events through the reducer. `touch-action: none` on the element
 * is what stops Safari claiming the gesture first; it is set in CSS, on the
 * viewport element only, so the rest of the page scrolls normally.
 */
export function bindGestures(element, { onTap, onPan, onPinchStart, onPinch }) {
    let state = createGestureState();

    const dispatch = (type, event) => {
        const rect = element.getBoundingClientRect();
        const result = reduce(state, {
            type, id: event.pointerId,
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
        });
        state = result.state;
        const action = result.action;
        if (!action) return;
        if (action.type === 'tap') onTap?.(action);
        else if (action.type === 'pan') onPan?.(action);
        else if (action.type === 'pinchstart') onPinchStart?.(action);
        else if (action.type === 'pinch') onPinch?.(action);
    };

    const onDown = event => {
        try { element.setPointerCapture(event.pointerId); } catch { /* best effort */ }
        dispatch('down', event);
    };
    const onMove = event => dispatch('move', event);
    const onUp = event => dispatch('up', event);
    const onCancel = event => dispatch('cancel', event);

    element.addEventListener('pointerdown', onDown);
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onUp);
    element.addEventListener('pointercancel', onCancel);

    return () => {
        element.removeEventListener('pointerdown', onDown);
        element.removeEventListener('pointermove', onMove);
        element.removeEventListener('pointerup', onUp);
        element.removeEventListener('pointercancel', onCancel);
    };
}

/**
 * Cancels WebKit's proprietary gesture events over the viewport.
 *
 * `touch-action: none` does not on its own stop Safari's page pinch-zoom, and a
 * passive listener cannot cancel anything - hence { passive: false }. We only
 * cancel; `event.scale` is deliberately unused, because on iOS these fire
 * alongside the pointer events for the same pinch and acting on both produces
 * conflicting state. tldraw and Excalidraw both took this exact route.
 */
export function suppressNativeZoom(element) {
    // gestureend is documented to fire twice, so the latch keeps it idempotent.
    let active = false;

    const cancel = event => {
        if (event.cancelable !== false) event.preventDefault();
    };
    const onStart = event => { active = true; cancel(event); };
    const onChange = event => { if (active) cancel(event); };
    const onEnd = event => { if (!active) return; active = false; cancel(event); };

    element.addEventListener('gesturestart', onStart, { passive: false });
    element.addEventListener('gesturechange', onChange, { passive: false });
    element.addEventListener('gestureend', onEnd, { passive: false });

    return () => {
        element.removeEventListener('gesturestart', onStart);
        element.removeEventListener('gesturechange', onChange);
        element.removeEventListener('gestureend', onEnd);
    };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd logicals-site && npx vitest run --root . test/overview-gestures.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/client/js/play/overview/gestures.js logicals-site/test/overview-gestures.test.ts
git commit -m "feat(overview): add single-owner gesture arbitration"
```

---

### Task 4: Canvas renderer

**Files:**
- Create: `logicals-site/client/js/play/overview/renderer.js`

**Interfaces:**
- Consumes: `CELL`, `blockVisible` from `geometry.js`; `worldToScreen` from `viewport.js`.
- Produces:
  - `GUTTER_LEFT = 78`, `GUTTER_TOP = 46`
  - `resizeCanvas(canvas, cssWidth, cssHeight) -> { dpr }`
  - `render(ctx, { layout, view, puzzle, marks, wrong, selected, cssWidth, cssHeight })`
  - `renderMinimap(ctx, { layout, view, marks, width, height, cssWidth, cssHeight })`

No unit test: this is DOM/canvas output and the Vitest environment has no DOM. Task 9 asserts its
observable consequences (fitted cell size, label legibility, no overflow) through Playwright.

- [ ] **Step 1: Write the implementation**

```js
// logicals-site/client/js/play/overview/renderer.js
/**
 * All canvas painting for the overview.
 *
 * The important decision here: headers are drawn in SCREEN space at a constant
 * font size, into fixed gutters. In the old table they lived inside the scaled
 * content, so they cost world width and shrank with the zoom - at fit scale the
 * labels rendered at 3.4px. Here the zoom cannot touch them.
 */

import { CELL, blockVisible } from './geometry.js';
import { worldToScreen } from './viewport.js';

/** Screen-space gutters reserved for the always-legible labels. */
export const GUTTER_LEFT = 78;
export const GUTTER_TOP = 46;

const LABEL_FONT_PX = 11;
const CATEGORY_FONT_PX = 9;
/** Below this the rows are too tight for text; labels are decimated, not shrunk. */
const LABEL_MIN_CELL_PX = 13;
/** Below this a glyph is noise, so the mark is drawn as a dot instead. */
const GLYPH_MIN_CELL_PX = 11;

const COLORS = {
    gutter: '#FBFAF7',
    rule: '#D9D4CA',
    blockRule: '#8A8378',
    cellLine: '#E2DED6',
    surface: '#FFFFFF',
    yesFill: '#E3F1EA',
    noFill: '#F2F1EE',
    yes: '#1B7A4B',
    no: '#8A8378',
    wrongFill: '#FBE9E7',
    wrong: '#C0392B',
    text: '#172033',
    accent: '#C6492D',
    teal: '#227C78',
    crosshair: 'rgba(34,124,120,.13)',
};

/** Sizes the backing store for the device pixel ratio so text stays crisp. */
export function resizeCanvas(canvas, cssWidth, cssHeight) {
    // Capped at 3: past that the backing store grows faster than the gain. iOS
    // also has a hard ceiling - 8192 px per dimension and 8192*8192 total area
    // since iOS 18 - and exceeding it fails SILENTLY, leaving a blank canvas.
    // A viewport-sized canvas is nowhere near it; a whole-grid-at-once canvas
    // would be, which is another reason to redraw the visible region per frame.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    return { dpr };
}

/**
 * Snaps a coordinate so a 1-unit line lands on whole device pixels.
 *
 * The naive "+0.5" is wrong once the context is scaled by the device pixel
 * ratio: half a CSS pixel is 1.5 device pixels at DPR 3, which blurs every
 * hairline. Snap in device space, and offset by half only when the rounded
 * device-pixel width is odd.
 */
function snap(value, dpr) {
    return Math.round(value * dpr) / dpr;
}

function hairline(value, dpr) {
    const width = Math.max(1, Math.round(dpr));
    const offset = width % 2 ? 0.5 / dpr : 0;
    return snap(value, dpr) + offset;
}

export function render(ctx, options) {
    const { cssWidth, cssHeight, dpr } = options;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    drawCells(ctx, options);
    drawBlockRules(ctx, options);
    drawCrosshair(ctx, options);
    drawHeaders(ctx, options);
}

function drawCells(ctx, { layout, view, marks, wrong, cssWidth, cssHeight, dpr }) {
    const size = CELL * view.scale;
    const glyphs = size >= GLYPH_MIN_CELL_PX;
    ctx.lineWidth = Math.max(0.5, Math.min(1, size / 34));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const cell of layout.cells) {
        const point = worldToScreen(view, cell.x, cell.y);
        if (point.x > cssWidth || point.y > cssHeight) continue;
        if (point.x + size < GUTTER_LEFT || point.y + size < GUTTER_TOP) continue;

        const mark = marks.get(cell.key);
        const isWrong = wrong.has(cell.key);

        ctx.fillStyle = isWrong ? COLORS.wrongFill
            : mark === 'yes' ? COLORS.yesFill
            : mark === 'no' ? COLORS.noFill
            : COLORS.surface;
        ctx.fillRect(point.x, point.y, size, size);
        ctx.strokeStyle = COLORS.cellLine;
        ctx.strokeRect(hairline(point.x, dpr), hairline(point.y, dpr), size - 1, size - 1);

        if (!mark) continue;
        const color = isWrong ? COLORS.wrong : mark === 'yes' ? COLORS.yes : COLORS.no;
        ctx.fillStyle = color;
        if (glyphs) {
            ctx.font = `${mark === 'yes' ? 700 : 400} ${Math.round(size * 0.62)}px system-ui, sans-serif`;
            ctx.fillText(mark === 'yes' ? '○' : '×', point.x + size / 2, point.y + size / 2 + size * 0.02);
        } else {
            const radius = Math.max(1, size * 0.22);
            ctx.beginPath();
            ctx.arc(point.x + size / 2, point.y + size / 2, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawBlockRules(ctx, { layout, view, dpr }) {
    const size = layout.valueCount * CELL * view.scale;
    ctx.strokeStyle = COLORS.blockRule;
    ctx.lineWidth = Math.max(1, Math.min(2, view.scale * 1.6));
    layout.rows.forEach((_, rowBlock) => {
        layout.columns.forEach((__, colBlock) => {
            if (!blockVisible(rowBlock, colBlock, layout.columns.length)) return;
            const origin = layout.cells.find(cell =>
                cell.rowBlock === rowBlock && cell.colBlock === colBlock
                && cell.rowValue === 0 && cell.colValue === 0);
            if (!origin) return;
            const point = worldToScreen(view, origin.x, origin.y);
            ctx.strokeRect(hairline(point.x, dpr), hairline(point.y, dpr), size, size);
        });
    });
}

/** The active row and column, tinted across the whole grid. */
function drawCrosshair(ctx, { view, selected, cssWidth, cssHeight }) {
    if (!selected) return;
    const size = CELL * view.scale;
    ctx.fillStyle = COLORS.crosshair;
    const point = worldToScreen(view, selected.x, selected.y);
    ctx.fillRect(GUTTER_LEFT, point.y, cssWidth - GUTTER_LEFT, size);
    ctx.fillRect(point.x, GUTTER_TOP, size, cssHeight - GUTTER_TOP);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(point.x - 1, point.y - 1, size + 2, size + 2);
}

function drawHeaders(ctx, { layout, view, puzzle, selected, cssWidth, cssHeight, dpr }) {
    const size = CELL * view.scale;
    const sparse = size < LABEL_MIN_CELL_PX;

    ctx.fillStyle = COLORS.gutter;
    ctx.fillRect(0, 0, GUTTER_LEFT, cssHeight);
    ctx.fillRect(0, 0, cssWidth, GUTTER_TOP);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ruleX = hairline(GUTTER_LEFT, dpr);
    const ruleY = hairline(GUTTER_TOP, dpr);
    ctx.moveTo(ruleX, 0); ctx.lineTo(ruleX, cssHeight);
    ctx.moveTo(0, ruleY); ctx.lineTo(cssWidth, ruleY);
    ctx.stroke();

    // Row labels.
    ctx.save();
    ctx.beginPath(); ctx.rect(0, GUTTER_TOP, GUTTER_LEFT, cssHeight - GUTTER_TOP); ctx.clip();
    ctx.textBaseline = 'middle';
    layout.rows.forEach((categoryIndex, rowBlock) => {
        const category = puzzle.categories[categoryIndex];
        for (let value = 0; value < layout.valueCount; value++) {
            const cell = layout.cells.find(c =>
                c.rowBlock === rowBlock && c.rowValue === value);
            if (!cell) continue;
            const y = worldToScreen(view, 0, cell.y).y + size / 2;
            if (y < GUTTER_TOP - 10 || y > cssHeight + 10) continue;
            const active = selected?.rowBlock === rowBlock && selected?.rowValue === value;
            if (sparse && !active && value !== 0) continue;
            ctx.textAlign = 'right';
            ctx.fillStyle = active ? COLORS.accent : COLORS.text;
            ctx.font = `${active ? 700 : 400} ${LABEL_FONT_PX}px system-ui, sans-serif`;
            ctx.fillText(category.values[value], GUTTER_LEFT - 6, y, GUTTER_LEFT - 10);
        }
        const first = layout.cells.find(c => c.rowBlock === rowBlock && c.rowValue === 0);
        if (!first) return;
        const top = worldToScreen(view, 0, first.y).y;
        if (top > GUTTER_TOP - 40 && top < cssHeight) {
            ctx.textAlign = 'left';
            ctx.fillStyle = COLORS.teal;
            ctx.font = `700 ${CATEGORY_FONT_PX}px system-ui, sans-serif`;
            ctx.fillText(category.label.toUpperCase(), 4, Math.max(GUTTER_TOP + 7, top + 7), GUTTER_LEFT - 8);
        }
    });
    ctx.restore();

    // Column labels, rotated with the canvas transform rather than
    // writing-mode: the CSS route needed vertical-rl plus a rotate plus sticky,
    // and those three do not survive each other in Safari.
    ctx.save();
    ctx.beginPath(); ctx.rect(GUTTER_LEFT, 0, cssWidth - GUTTER_LEFT, GUTTER_TOP); ctx.clip();
    ctx.textBaseline = 'middle';
    layout.columns.forEach((categoryIndex, colBlock) => {
        const category = puzzle.categories[categoryIndex];
        for (let value = 0; value < layout.valueCount; value++) {
            const cell = layout.cells.find(c =>
                c.colBlock === colBlock && c.colValue === value);
            if (!cell) continue;
            const x = worldToScreen(view, cell.x, 0).x + size / 2;
            if (x < GUTTER_LEFT - 10 || x > cssWidth + 10) continue;
            const active = selected?.colBlock === colBlock && selected?.colValue === value;
            if (sparse && !active && value !== 0) continue;
            ctx.save();
            ctx.translate(x, GUTTER_TOP - 4);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'left';
            ctx.fillStyle = active ? COLORS.accent : COLORS.text;
            ctx.font = `${active ? 700 : 400} ${LABEL_FONT_PX}px system-ui, sans-serif`;
            ctx.fillText(category.values[value], 0, 0, GUTTER_TOP - 16);
            ctx.restore();
        }
        const first = layout.cells.find(c => c.colBlock === colBlock && c.colValue === 0);
        if (!first) return;
        const left = worldToScreen(view, first.x, 0).x;
        if (left > GUTTER_LEFT - 60 && left < cssWidth) {
            ctx.textAlign = 'left';
            ctx.fillStyle = COLORS.teal;
            ctx.font = `700 ${CATEGORY_FONT_PX}px system-ui, sans-serif`;
            ctx.fillText(category.label.toUpperCase(), Math.max(GUTTER_LEFT + 3, left + 2), 7, 90);
        }
    });
    ctx.restore();
}

/** The whole world plus the current viewport rectangle, for the empty corner. */
export function renderMinimap(ctx, { layout, view, marks, width, height, cssWidth, cssHeight }) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min((width - 8) / layout.width, (height - 8) / layout.height);
    const offsetX = (width - layout.width * scale) / 2;
    const offsetY = (height - layout.height * scale) / 2;

    ctx.fillStyle = '#ECE9E2';
    for (const cell of layout.cells) {
        ctx.fillRect(offsetX + cell.x * scale, offsetY + cell.y * scale, CELL * scale, CELL * scale);
    }
    for (const cell of layout.cells) {
        const mark = marks.get(cell.key);
        if (!mark) continue;
        ctx.fillStyle = mark === 'yes' ? COLORS.yes : '#B5AFA4';
        ctx.fillRect(offsetX + cell.x * scale, offsetY + cell.y * scale, CELL * scale, CELL * scale);
    }

    const topLeft = { x: (GUTTER_LEFT - view.tx) / view.scale, y: (GUTTER_TOP - view.ty) / view.scale };
    const bottomRight = { x: (cssWidth - view.tx) / view.scale, y: (cssHeight - view.ty) / view.scale };
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(
        offsetX + topLeft.x * scale, offsetY + topLeft.y * scale,
        (bottomRight.x - topLeft.x) * scale, (bottomRight.y - topLeft.y) * scale,
    );
}
```

- [ ] **Step 2: Verify the module parses and the suite is still green**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test`
Expected: exit 0; 46 existing tests plus the 24 new unit tests pass.

- [ ] **Step 3: Commit**

```bash
git add logicals-site/client/js/play/overview/renderer.js
git commit -m "feat(overview): render the grid and screen-space headers to canvas"
```

---

### Task 5: Accessibility mirror

**Files:**
- Create: `logicals-site/client/js/play/overview/a11yMirror.js`

**Interfaces:**
- Consumes: `CELL` from `geometry.js`; `worldToScreen` from `viewport.js`.
- Produces:
  - `createMirror(host, layout, puzzle, { onActivate }) -> { cells: Map<string, HTMLElement>, position(view), describe(key, mark, wrong), setDisabled(disabled), destroy() }`

Rationale, from the research: iOS VoiceOver support for `role="grid"` is recent and thin, index
attributes were deferred for iOS in WebKit, and every documented VoiceOver grid failure traces to
virtualization. So: a sibling subtree (not canvas fallback content), a strictly pure
`grid → row → gridcell` chain, no virtualization at 250 cells, coordinates written into each
accessible name, and the tree mutated only on state change — never on pan or zoom.

- [ ] **Step 1: Write the implementation**

```js
// logicals-site/client/js/play/overview/a11yMirror.js
/**
 * Accessible mirror of the canvas grid.
 *
 * A sibling DOM subtree rather than canvas fallback content: WebKit's fallback
 * accessibility story has been unfinished since 2013, whereas an ordinary
 * subtree is well-trodden markup.
 *
 * Two rules matter more than anything else here:
 *
 *  - The ownership chain grid > row > gridcell stays pure and nothing is
 *    virtualized. Every documented VoiceOver grid failure comes from extra
 *    wrapper layers or recycled rows.
 *  - The tree is mutated only when the puzzle state changes. Pan and zoom move
 *    ONE container transform; touching 250 nodes per frame is what makes
 *    assistive technology fall over, and it is not needed.
 *
 * Cells are transparent but geometrically real, because VoiceOver's direct-touch
 * exploration uses element geometry - a 1px clip box would send every touch to
 * the same place.
 */

import { CELL } from './geometry.js';
import { worldToScreen } from './viewport.js';

const MARK_TEXT = { yes: 'sichere Zuordnung', no: 'ausgeschlossen' };

export function createMirror(host, layout, puzzle, { onActivate }) {
    host.replaceChildren();
    host.setAttribute('role', 'grid');
    host.setAttribute('aria-label', 'Logikmatrix, vollständige Übersicht');

    const surface = document.createElement('div');
    surface.className = 'overview-mirror__surface';
    host.append(surface);

    const cells = new Map();
    let firstCell = null;

    // One row element per (row block, row value), in reading order.
    layout.rows.forEach((rowCategoryIndex, rowBlock) => {
        for (let rowValue = 0; rowValue < layout.valueCount; rowValue++) {
            const rowCells = layout.cells.filter(cell =>
                cell.rowBlock === rowBlock && cell.rowValue === rowValue);
            if (!rowCells.length) continue;

            const row = document.createElement('div');
            row.setAttribute('role', 'row');
            row.className = 'overview-mirror__row';

            for (const cell of rowCells) {
                const node = document.createElement('div');
                node.setAttribute('role', 'gridcell');
                node.className = 'overview-mirror__cell';
                node.tabIndex = -1;
                node.dataset.key = cell.key;
                node.dataset.x = String(cell.x);
                node.dataset.y = String(cell.y);
                node.addEventListener('click', () => onActivate(cell.key));
                node.addEventListener('keydown', event => {
                    if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        onActivate(cell.key);
                    }
                });
                row.append(node);
                cells.set(cell.key, node);
                if (!firstCell) { firstCell = node; node.tabIndex = 0; }
            }
            surface.append(row);
        }
    });

    function describe(key, mark, wrong) {
        const node = cells.get(key);
        if (!node) return;
        const cell = layout.cells.find(candidate => candidate.key === key);
        if (!cell) return;
        const rowCategory = puzzle.categories[cell.rowCategoryIndex];
        const colCategory = puzzle.categories[cell.colCategoryIndex];
        // Coordinates go into the name, not into aria-rowindex/colindex: WebKit
        // deferred exposing those on iOS and never confirmed finishing it.
        const state = mark ? MARK_TEXT[mark] : 'leer';
        node.setAttribute(
            'aria-label',
            `Zeile ${rowCategory.values[cell.rowValue]}, Spalte ${colCategory.values[cell.colValue]}, ${state}`
            + `${wrong ? ', als falsch markiert' : ''}`,
        );
        node.setAttribute('aria-selected', mark ? 'true' : 'false');
    }

    /** Moves the whole mirror with one transform; never touches the cells. */
    function position(view) {
        const origin = worldToScreen(view, 0, 0);
        surface.style.transform = `translate(${origin.x}px, ${origin.y}px) scale(${view.scale})`;
        surface.style.setProperty('--mirror-cell', `${CELL}px`);
    }

    function setDisabled(disabled) {
        host.setAttribute('aria-disabled', String(disabled));
        for (const node of cells.values()) node.tabIndex = disabled ? -1 : (node === firstCell ? 0 : -1);
    }

    return {
        cells,
        position,
        describe,
        setDisabled,
        destroy() { host.replaceChildren(); },
    };
}
```

- [ ] **Step 2: Verify typecheck and suite**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test`
Expected: exit 0, all green.

- [ ] **Step 3: Commit**

```bash
git add logicals-site/client/js/play/overview/a11yMirror.js
git commit -m "feat(overview): add non-virtualized accessible grid mirror"
```

---

### Task 6: Overview component

**Files:**
- Create: `logicals-site/client/js/play/overview/overviewCanvas.js`
- Delete: `logicals-site/client/js/play/overviewView.js`
- Delete: `logicals-site/test/overview-zoom.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–5.
- Produces:
  - `createOverviewCanvas({ canvas, minimap, mirrorHost, readoutPair, readoutCats, markButtons, fitButton, puzzle, cellKey, onActivate, onSelect }) -> PlayView & { fit(), selectKey(key), selected(), destroy() }`
  - `PlayView` is `{ paint(key, mark, wrong), setDisabled(disabled), destroy() }`.

- [ ] **Step 1: Write the implementation**

```js
// logicals-site/client/js/play/overview/overviewCanvas.js
/**
 * The overview: one canvas, one world, one gesture owner.
 *
 * Marking is a two-step selection model rather than a direct toggle. That is
 * what lets the complete grid stay on screen: a tap only has to identify a cell,
 * and identification survives a 13px cell, whereas hitting a 13px toggle does
 * not. The action bar that applies the mark is a normal 44px control.
 */

import { CELL, MIN_CELL_PX, createLayout, hitTest } from './geometry.js';
import {
    MAX_SCALE, fitView, zoomTo, panBy, clampView, minScaleFor, screenToWorld,
} from './viewport.js';
import { bindGestures, suppressNativeZoom } from './gestures.js';
import { render, renderMinimap, resizeCanvas, GUTTER_LEFT, GUTTER_TOP } from './renderer.js';
import { createMirror } from './a11yMirror.js';

const TAP_TOLERANCE_PX = 22;
const PADDING = 6;

export function createOverviewCanvas({
    canvas, minimap, mirrorHost, readoutPair, readoutCats, markButtons, fitButton,
    puzzle, cellKey, onActivate, onSelect,
}) {
    const layout = createLayout(puzzle, cellKey);
    const marks = new Map();
    const wrong = new Set();
    const context = canvas.getContext('2d');
    const minimapContext = minimap?.getContext('2d') ?? null;
    const mirror = createMirror(mirrorHost, layout, puzzle, { onActivate });

    let view = { scale: 1, tx: 0, ty: 0 };
    let selected = null;
    let disabled = false;
    let cssWidth = 0;
    let cssHeight = 0;
    let dpr = 1;
    let frame = 0;

    const limits = { minScale: minScaleFor(MIN_CELL_PX), maxScale: MAX_SCALE };
    const bounds = () => ({
        worldWidth: layout.width, worldHeight: layout.height,
        viewWidth: cssWidth, viewHeight: cssHeight,
        gutterLeft: GUTTER_LEFT, gutterTop: GUTTER_TOP, padding: PADDING,
    });

    function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (!cssWidth || !cssHeight) return;
            render(context, {
                layout, view, puzzle, marks, wrong, selected, cssWidth, cssHeight, dpr,
            });
            if (minimapContext) {
                renderMinimap(minimapContext, {
                    layout, view, marks,
                    width: minimap.width, height: minimap.height,
                    cssWidth, cssHeight,
                });
            }
            mirror.position(view);
        });
    }

    function measure() {
        const rect = canvas.parentElement.getBoundingClientRect();
        cssWidth = rect.width;
        cssHeight = rect.height;
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        ({ dpr } = resizeCanvas(canvas, cssWidth, cssHeight));
    }

    function fit() {
        measure();
        view = clampView(fitView(bounds()), { ...bounds(), minVisible: 60 });
        schedule();
    }

    function renderReadout() {
        const hasSelection = Boolean(selected);
        for (const button of markButtons) button.disabled = disabled || !hasSelection;
        if (!hasSelection) {
            readoutPair.textContent = 'Keine Zelle gewählt';
            readoutCats.textContent = 'Tippe eine Zelle an';
            return;
        }
        const rowCategory = puzzle.categories[selected.rowCategoryIndex];
        const colCategory = puzzle.categories[selected.colCategoryIndex];
        // Both values always spelled out, so the cell's identity never depends
        // on the labels being legible at the current zoom.
        readoutPair.textContent =
            `${rowCategory.values[selected.rowValue]}  ×  ${colCategory.values[selected.colValue]}`;
        readoutCats.textContent = `${rowCategory.label} × ${colCategory.label}`;
    }

    function setSelected(cell) {
        selected = cell;
        renderReadout();
        onSelect?.(cell ? cell.key : null);
        schedule();
    }

    /** The scale the current pinch started from; the ratio is applied to this. */
    let pinchBaseScale = 1;

    bindGestures(canvas.parentElement, {
        onTap({ x, y }) {
            if (disabled) return;
            // Taps inside the header gutters belong to the labels, not to a
            // cell. The hit test must mirror the way the gutters are drawn,
            // otherwise a tap on a label silently selects whatever sits behind.
            if (x < GUTTER_LEFT || y < GUTTER_TOP) return;
            const world = screenToWorld(view, x, y);
            setSelected(hitTest(layout, world.x, world.y, view.scale, TAP_TOLERANCE_PX));
        },
        onPan({ dx, dy }) {
            view = clampView(panBy(view, dx, dy), { ...bounds(), minVisible: 60 });
            schedule();
        },
        onPinchStart() {
            pinchBaseScale = view.scale;
        },
        onPinch({ centerX, centerY, scaleFromStart, dx, dy }) {
            const zoomed = zoomTo(view, centerX, centerY, pinchBaseScale * scaleFromStart, limits);
            view = clampView(panBy(zoomed, dx, dy), { ...bounds(), minVisible: 60 });
            schedule();
        },
    });

    // touch-action: none is necessary but not sufficient on iOS; the
    // proprietary gesture events have to be cancelled as well.
    const releaseNativeZoom = suppressNativeZoom(canvas.parentElement);

    fitButton?.addEventListener('click', fit);

    const refit = () => {
        const previous = selected;
        fit();
        // Rotation and toolbar collapse must not lose the player's place.
        if (previous) setSelected(previous);
    };

    const observer = new ResizeObserver(refit);
    observer.observe(canvas.parentElement);
    // Safari's collapsing toolbar changes the visual viewport without changing
    // the layout viewport, so ResizeObserver alone can miss it.
    window.visualViewport?.addEventListener('resize', refit);

    return {
        fit,
        selected: () => selected,
        selectKey(key) {
            setSelected(layout.cells.find(cell => cell.key === key) ?? null);
        },
        paint(key, mark, isWrong) {
            if (mark) marks.set(key, mark); else marks.delete(key);
            if (isWrong) wrong.add(key); else wrong.delete(key);
            mirror.describe(key, mark, isWrong);
            schedule();
        },
        setDisabled(next) {
            disabled = next;
            mirror.setDisabled(next);
            renderReadout();
        },
        destroy() {
            observer.disconnect();
            window.visualViewport?.removeEventListener('resize', refit);
            releaseNativeZoom();
            mirror.destroy();
            cancelAnimationFrame(frame);
        },
    };
}
```

- [ ] **Step 2: Delete the superseded module and its test**

```bash
git rm logicals-site/client/js/play/overviewView.js logicals-site/test/overview-zoom.test.ts
```

- [ ] **Step 3: Verify nothing else imports the deleted module**

Run: `cd logicals-site && grep -rn "overviewView" client worker test e2e`
Expected: exactly one remaining hit, the import in `playController.js`, which Task 7 replaces.

- [ ] **Step 4: Commit**

```bash
git add -A logicals-site/client/js/play/overview logicals-site/client/js/play/overviewView.js logicals-site/test/overview-zoom.test.ts
git commit -m "feat(overview): wire the canvas overview component and drop the table view"
```

---

### Task 7: Play controller view registry

**Files:**
- Modify: `logicals-site/client/js/play/playController.js`

**Interfaces:**
- Consumes: `createOverviewCanvas` from Task 6; the existing `buildPager` from `matrixView.js`, unchanged.
- Produces: a `views` array of `PlayView`. `onCellActivate(key)` keeps its exact signature and semantics.

- [ ] **Step 1: Replace the import and the cell registry**

In `playController.js`, replace:

```js
import { buildOverview, createZoom } from './overviewView.js';
```

with:

```js
import { createOverviewCanvas } from './overview/overviewCanvas.js';
```

Replace the module-level declarations:

```js
/** key -> every button representing it (one in the pager, one in the overview). */
let cellsByKey = new Map();
```

with:

```js
/** key -> the pager button representing it. */
let pagerCells = new Map();
/** Every view that paints marks. The pager owns buttons; the overview owns a canvas. */
let views = [];
let overview = null;
```

- [ ] **Step 2: Rewrite painting to fan out over the views**

Replace `paintCell` and `paintAll`:

```js
function paintCell(key) {
    const mark = state.marks.get(key);
    const isWrong = state.wrong.has(key);
    const button = pagerCells.get(key);
    if (button) {
        const symbol = mark ? MARK_SYMBOLS[mark] : '';
        const description = mark === 'yes' ? 'sichere Zuordnung' : mark === 'no' ? 'ausgeschlossen' : 'leer';
        button.textContent = symbol;
        button.classList.toggle('is-yes', mark === 'yes');
        button.classList.toggle('is-no', mark === 'no');
        button.classList.toggle('is-wrong', isWrong);
        button.setAttribute('aria-label', `${button.dataset.label}: ${description}`);
    }
    for (const view of views) view.paint(key, mark, isWrong);
}

function paintAll() {
    for (const key of pagerCells.keys()) paintCell(key);
}
```

- [ ] **Step 3: Update the pause lock to use the registry**

In `renderPauseState`, replace the button loop:

```js
    for (const button of pagerCells.values()) button.disabled = paused;
    for (const view of views) view.setDisabled(paused);
```

- [ ] **Step 4: Rebuild both views in `openPlay`**

Replace the two view-construction blocks:

```js
    // Both views are built every time; the pager owns buttons, the overview a canvas.
    overview?.destroy();
    pagerCells = new Map();
    const pager = buildPager(puzzle, el('pager-track'), el('pager-nav'), {
        cellKey, onActivate: onCellActivate,
    });
    for (const [key, buttons] of pager.cells) pagerCells.set(key, buttons[0]);

    overview = createOverviewCanvas({
        canvas: el('overview-canvas'),
        minimap: el('overview-minimap'),
        mirrorHost: el('overview-mirror'),
        readoutPair: el('overview-readout-pair'),
        readoutCats: el('overview-readout-cats'),
        markButtons: [el('overview-mark-no'), el('overview-mark-yes'), el('overview-mark-clear')],
        fitButton: el('overview-fit'),
        puzzle, cellKey, onActivate: onCellActivate,
    });
    views = [overview];
```

Replace `resetGridScroll()` and its call site with `overview.fit()`, and delete the
`resetGridScroll` function. Replace the deferred fit at the end of `openPlay`:

```js
    requestAnimationFrame(() => overview?.fit());
```

- [ ] **Step 5: Wire the action bar and drop the old zoom controls**

In `initPlay`, replace the `createZoom` block and the three zoom listeners with:

```js
    for (const [id, mark] of [['overview-mark-no', 'no'], ['overview-mark-yes', 'yes'], ['overview-mark-clear', null]]) {
        el(id).addEventListener('click', () => {
            const cell = overview?.selected();
            if (!cell || paused || state.solved) return;
            setMark(cell.key, mark);
        });
    }
```

and add, next to `onCellActivate`:

```js
/**
 * Sets a cell to an exact mark rather than cycling it. The action bar names the
 * target state, so cycling to it would need up to three taps.
 */
function setMark(key, mark) {
    if (state.solved || paused) return;
    const previous = state.marks.get(key);
    if (previous === mark) return;
    if (mark) state.marks.set(key, mark); else state.marks.delete(key);
    state.undo.push({ key, previous });

    clearWrongMarks();
    paintCell(key);
    renderPairProgress();
    renderUndo();
    persist();

    if (evaluate(state.marks, state.truth).solved) handleSolved();
    else setStatus('');
}
```

- [ ] **Step 6: Verify the suite and typecheck**

Run: `cd logicals-site && npx tsc --noEmit && npx vitest run --root . test`
Expected: exit 0, all green.

- [ ] **Step 7: Commit**

```bash
git add logicals-site/client/js/play/playController.js
git commit -m "refactor(play): paint marks through a view registry instead of button arrays"
```

---

### Task 8: Markup and styles

**Files:**
- Modify: `logicals-site/client/index.html`
- Modify: `logicals-site/client/styles/play.css`

- [ ] **Step 1: Replace the overview markup**

In `index.html`, replace the whole `<div class="play-overview" id="play-overview"> … </div>` block:

```html
            <div class="play-overview" id="play-overview">
                <div class="overview-viewport" id="overview-viewport">
                    <canvas id="overview-canvas" aria-hidden="true"></canvas>
                    <div class="overview-mirror" id="overview-mirror"></div>
                    <canvas class="overview-minimap" id="overview-minimap" width="152" height="152" aria-hidden="true"></canvas>
                    <button class="btn btn--ghost btn--small overview-fit" type="button" id="overview-fit">Einpassen</button>
                </div>
                <div class="overview-actions">
                    <div class="overview-readout" id="overview-readout">
                        <p class="overview-readout__pair" id="overview-readout-pair">Keine Zelle gewählt</p>
                        <p class="overview-readout__cats" id="overview-readout-cats">Tippe eine Zelle an</p>
                    </div>
                    <button class="overview-mark" type="button" id="overview-mark-no" disabled aria-label="Ausschließen">×</button>
                    <button class="overview-mark" type="button" id="overview-mark-yes" disabled aria-label="Sichere Zuordnung">○</button>
                    <button class="overview-mark" type="button" id="overview-mark-clear" disabled aria-label="Markierung entfernen">␣</button>
                </div>
            </div>
```

- [ ] **Step 2: Replace the overview styles**

In `play.css`, delete the `--- Overview (whole grid) ---` section (from `.play-overview` through
`.overview-zoom-hint[hidden]`) and put this in its place:

```css
/* --- Overview (whole grid, canvas viewport) ------------------------------- */

.play-overview { display: grid; gap: var(--gap-sm); min-height: 0; }

/*
 * The only gesture surface on the screen. touch-action: none is what stops
 * Safari claiming the pinch before we see it; it is scoped to this element, so
 * the rest of the page still scrolls and zooms normally.
 */
.overview-viewport {
    position: relative;
    min-height: 0;
    height: min(58svh, 560px);
    border: 1px solid var(--line);
    border-radius: var(--radius);
    background: var(--surface);
    overflow: hidden;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
}
.overview-viewport > canvas#overview-canvas { display: block; width: 100%; height: 100%; }

/*
 * The accessible mirror sits exactly on top of the painted cells. It is
 * transparent but geometrically real: VoiceOver's direct-touch exploration uses
 * element geometry, so a clipped 1px box would send every touch to one spot.
 * Pointer events stay with the canvas; the mirror is for AT and keyboard.
 */
.overview-mirror { position: absolute; inset: 0; pointer-events: none; }
.overview-mirror__surface { position: absolute; top: 0; left: 0; transform-origin: 0 0; }
.overview-mirror__row { display: block; }
.overview-mirror__cell {
    position: absolute;
    width: var(--mirror-cell, 40px);
    height: var(--mirror-cell, 40px);
    opacity: 0;
}
.overview-mirror__cell:focus-visible { opacity: 1; outline: 2px solid var(--teal); }

.overview-minimap {
    position: absolute; right: 8px; top: 8px;
    width: 76px; height: 76px;
    border: 1px solid var(--line); border-radius: 8px;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    box-shadow: var(--shadow-sheet, 0 2px 8px rgba(0,0,0,.1));
    pointer-events: none;
}
.overview-fit { position: absolute; left: 8px; bottom: 8px; min-height: var(--tap-min); }

.overview-actions {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: 8px;
}
.overview-readout { min-width: 0; }
.overview-readout__pair {
    margin: 0; font-size: 15px; font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.overview-readout__cats {
    margin: 0; font-size: 11px; color: var(--muted);
    text-transform: uppercase; letter-spacing: .05em;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.overview-mark {
    min-width: 52px; min-height: var(--tap-min);
    border: 1px solid var(--line); border-radius: 12px;
    background: var(--surface); color: var(--text);
    font: inherit; font-size: 22px; line-height: 1;
}
.overview-mark:disabled { opacity: .35; }
```

- [ ] **Step 3: Give the viewport the full height on tablet and desktop**

In the `@media (min-width: 900px)` block, replace the `.grid-scroll { max-height: none; }` rule with:

```css
    .overview-viewport { height: min(76svh, 900px); }
```

- [ ] **Step 4: Side-mount the action bar in phone landscape**

In the `@media (max-width: 899px) and (max-height: 520px)` block, replace the
`.grid-scroll { … }` rule with:

```css
    /* Stacked chrome costs 46% of the height in landscape, which drops the
       fitted cell to 9.4px - below the 12.5px floor at which a tap can still be
       attributed. Side-mounting it restores 15.5px. Measured, not guessed. */
    .play-overview {
        grid-template-columns: minmax(0, 1fr) 150px;
        align-items: stretch;
    }
    .overview-viewport { height: min(84svh, 100%); }
    .overview-actions {
        grid-template-columns: minmax(0, 1fr);
        align-content: center;
    }
```

- [ ] **Step 5: Verify the shell tests still pass**

Run: `cd logicals-site && npx vitest run --root . test && npx tsc --noEmit`
Expected: exit 0. `app-shell.test.ts` and `player-ui.test.ts` assert on `index.html` text and
must still pass.

- [ ] **Step 6: Commit**

```bash
git add logicals-site/client/index.html logicals-site/client/styles/play.css
git commit -m "feat(overview): replace the zoomable table markup with the canvas viewport"
```

---

### Task 9: End-to-end regression across the device matrix

**Files:**
- Create: `logicals-site/e2e/overview-canvas.spec.ts`
- Modify: `logicals-site/e2e/solo.spec.ts`

- [ ] **Step 1: Repair `solo.spec.ts`**

Delete every assertion that references `#grid-scroll`, `#grid-zoom`, `#zoom-level`, `#zoom-in`,
`#zoom-fit`, `data-interactive`, `data-touch-layout`, `#overview-zoom-hint`, or the synthetic
`TouchEvent` pinch — the elements no longer exist. Keep the rest of the flow exactly as it is:
generation, `Spielen`, `#screen-play` active, `data-view="overview"`, the toolbar-fits check, the
view-toggle round trip, and the final no-horizontal-overflow assertion. Replace the removed
overview assertions with:

```ts
  await expect(page.locator('#overview-canvas')).toBeVisible();
  const fitted = await page.evaluate(() => {
    const viewport = document.getElementById('overview-viewport')!.getBoundingClientRect();
    return viewport.width > 0 && viewport.height > 0;
  });
  expect(fitted).toBe(true);
```

- [ ] **Step 2: Write the failing spec**

```ts
// logicals-site/e2e/overview-canvas.spec.ts
import { expect, test, type Page } from '@playwright/test';

const DEVICES = [
  { name: 'iPhone 13 mini portrait', width: 375, height: 812 },
  { name: 'iPhone 14 portrait', width: 390, height: 844 },
  { name: 'iPhone 13 mini landscape', width: 812, height: 375 },
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'iPad landscape', width: 1024, height: 768 },
];

async function openPuzzle(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  await page.route('**/api/players', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-17T00:00:00Z' }] }),
  }));
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
  await page.goto('/');
  await page.locator('#start-button').click();
  await page.locator('#field-puzzleCount').selectOption('1');
  await page.locator('#field-categoryCount').selectOption('5');
  await page.locator('#field-valuesPerCategory').selectOption('5');
  await page.locator('#field-difficulty').selectOption('leicht');
  await page.locator('#generate-button').click();
  await expect(page.locator('.puzzle')).toHaveCount(1, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Spielen', exact: true }).click();
  await expect(page.locator('#overview-canvas')).toBeVisible();
  await page.waitForTimeout(300);
}

for (const device of DEVICES) {
  test(`${device.name}: the whole grid fits above the tap floor`, async ({ page }) => {
    test.setTimeout(120_000);
    await openPuzzle(page, device.width, device.height);

    const cellPx = await page.evaluate(() => {
      const mirror = document.querySelector('.overview-mirror__surface') as HTMLElement;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(mirror).transform);
      return 40 * matrix.a;
    });
    expect(cellPx).toBeGreaterThanOrEqual(12.5);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const undersized = await page.locator('.overview-actions button:visible').evaluateAll(buttons =>
      buttons.map(b => b.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44));
    expect(undersized).toEqual([]);
  });
}

test('tapping selects the cell and the action bar marks it in both views', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  const viewport = page.locator('#overview-viewport');
  const box = (await viewport.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.6);

  await expect(page.locator('#overview-readout-pair')).not.toHaveText('Keine Zelle gewählt');
  await expect(page.locator('#overview-mark-yes')).toBeEnabled();

  const key = await page.evaluate(() => {
    const focused = document.querySelector('.overview-mirror__cell[aria-selected]');
    return focused?.getAttribute('data-key') ?? null;
  });

  await page.locator('#overview-mark-no').click();
  await expect(page.locator('#play-undo')).toBeEnabled();

  // The same logical cell must carry the mark in the pager view.
  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
  const pagerMark = await page.evaluate(k => {
    const button = document.querySelector(`.play-pager .cell[data-key="${k}"]`);
    return button?.textContent ?? '';
  }, key);
  expect(pagerMark).toBe('×');
});

test('undo reverts a mark made from the overview', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);
  const box = (await page.locator('#overview-viewport').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.6);
  await page.locator('#overview-mark-yes').click();
  await expect(page.locator('#play-undo')).toBeEnabled();
  await page.locator('#play-undo').click();
  await expect(page.locator('#play-undo')).toBeDisabled();
});

test('rotation keeps the grid fitted and above the tap floor', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);
  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForTimeout(400);
  const cellPx = await page.evaluate(() => {
    const mirror = document.querySelector('.overview-mirror__surface') as HTMLElement;
    return 40 * new DOMMatrixReadOnly(getComputedStyle(mirror).transform).a;
  });
  expect(cellPx).toBeGreaterThanOrEqual(12.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
```

- [ ] **Step 3: Run the spec to verify it fails before Task 8 lands, passes after**

Run: `cd logicals-site && npx playwright test e2e/overview-canvas.spec.ts --reporter=line`
Expected: PASS, 8 tests.

- [ ] **Step 4: Run the whole e2e suite**

Run: `cd logicals-site && npx playwright test --reporter=line`
Expected: PASS. `duel.spec.ts` and `ios-layout.spec.ts` must be untouched and green.

- [ ] **Step 5: Commit**

```bash
git add logicals-site/e2e/overview-canvas.spec.ts logicals-site/e2e/solo.spec.ts
git commit -m "test(overview): cover the canvas viewport across the device matrix"
```

---

### Task 10: Full verification and acceptance screenshots

**Files:** none modified.

- [ ] **Step 1: Run every suite from a clean install**

```bash
cd /home/jonas/Documents/Code/-german-logic-puzzle-generator
npm ci && npx jest && npx tsc --noEmit
cd logicals-site
npm ci --ignore-scripts && npx vitest run --root . test && npx tsc --noEmit && npm run build
npx playwright test --reporter=line
```

Expected: 162 passed / 6 skipped generator tests; site unit tests green (46 existing plus the new
suites); both typechecks exit 0; build exits 0; every e2e scenario passes.

- [ ] **Step 2: Confirm the two-device duel flow still completes**

Run: `cd logicals-site && npx playwright test e2e/duel.spec.ts --reporter=line`
Expected: PASS. Record the exact output; this is the check that the redesign did not damage the
duel protocol, shared start or result attribution.

- [ ] **Step 3: Capture acceptance screenshots**

Write a throwaway script that, for each of iPhone 13 mini portrait, iPhone 14 portrait,
iPhone 13 mini landscape, iPad portrait and iPad landscape, opens a 5×5 puzzle and captures three
states — fitted, one cell selected, and zoomed in — into
`/home/jonas/.claude/tmp/.../scratchpad/acceptance/`. Delete the script afterwards so the working
tree stays clean. These are for the user's visual sign-off before anything is pushed.

- [ ] **Step 4: Confirm the tree is clean and push**

```bash
cd /home/jonas/Documents/Code/-german-logic-puzzle-generator
git status --short          # must be empty
git push -u origin redesign/mobile-canvas-overview
```

- [ ] **Step 5: Stop**

Do **not** update the ChatGPT Site. The user chose to review the pushed branch and the
screenshots first; publishing is a separate step requiring explicit approval.

---

## Self-Review

**Spec coverage.** §3.1 principles 1–3 → Tasks 1, 2, 4. Principle 4 (selection + action bar) →
Tasks 6, 7, 8. Principle 5 (crosshair, minimap) → Task 4. Principle 6 (one gesture owner) →
Tasks 3, 8. Principle 7 (zoom floor) → Tasks 1, 2. Principle 8 (landscape) → Task 8 Step 4.
Principle 9 (a11y) → Task 5. Principle 10 (state untouched) → Task 7. §6 integration contract →
Task 7. §8 acceptance criteria 1–5 → Task 9; 6–7 → Task 9 Steps 2–3; 8 → Task 9 Step 4;
9–10 → Task 10.

**Placeholder scan.** No TBD, no "handle edge cases", no "similar to Task N". Every code step
carries the actual code. Task 10 Step 3 describes a throwaway script rather than showing it,
which is acceptable: it produces no committed artefact.

**Type consistency.** `PlayView` is `{ paint(key, mark, wrong), setDisabled(disabled), destroy() }`
in Tasks 6 and 7. `createLayout(puzzle, cellKey)` is called with two arguments in Tasks 1, 5, 6.
`hitTest(layout, worldX, worldY, scale, tolerancePx)` matches in Tasks 1 and 6. `fitView` takes
the same option object in Tasks 2 and 6. `GUTTER_LEFT`/`GUTTER_TOP` are exported by `renderer.js`
(Task 4) and imported by `overviewCanvas.js` (Task 6). `minScaleFor` is exported by `viewport.js`
and used in Tasks 2 and 6.

**Known gap, deliberate.** `viewport.js`'s `fitView` hard-codes the `12.5` floor rather than
importing `MIN_CELL_PX`, to keep `geometry.js` → `viewport.js` the only dependency direction. If
the floor ever changes, both constants must move together; the unit test in Task 2
(`never fits below the tap-disambiguation floor`) fails loudly if they drift apart.
