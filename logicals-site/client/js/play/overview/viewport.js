/**
 * The view transform: screen = world * scale + t.
 *
 * Every function is pure and returns a new view. That is deliberate - the old
 * overview kept its offset in `scrollLeft`, which the browser clamps and rounds
 * to whole pixels, so each gesture lost a remainder and the grid slowly drifted
 * out of alignment. A plain float pair has no such behaviour.
 */

import { CELL, MIN_CELL_PX } from './geometry.js';

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
        minScaleFor(MIN_CELL_PX),
        Math.min(MAX_SCALE, availableWidth / worldWidth, availableHeight / worldHeight),
    );
    return {
        scale,
        tx: gutterLeft + padding + Math.max(0, (availableWidth - worldWidth * scale) / 2),
        ty: gutterTop + padding + Math.max(0, (availableHeight - worldHeight * scale) / 2),
    };
}

/** Zoom about a fixed screen point by a relative factor. Discrete steps only. */
export function zoomAbout(view, screenX, screenY, factor, { minScale, maxScale }) {
    return zoomTo(view, screenX, screenY, view.scale * factor, { minScale, maxScale });
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
