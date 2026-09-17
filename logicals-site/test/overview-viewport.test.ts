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
    const spreads = [1, 4, 20, 60, 20, 4, 1];
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
