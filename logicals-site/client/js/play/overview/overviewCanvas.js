/**
 * The overview: one canvas, one world, one gesture owner.
 *
 * Marking is a two-step selection model rather than a direct toggle. That is
 * what lets the complete grid stay on screen: a tap only has to IDENTIFY a cell,
 * and identification survives a 13px cell, whereas hitting a 13px toggle does
 * not. The action bar that applies the mark is a normal 44px control - which is
 * also what makes the small cells conforming under WCAG 2.2 SC 2.5.8's
 * "equivalent control" exception.
 */

import { CELL, MIN_CELL_PX, createLayout, hitTest } from './geometry.js';
import {
    MAX_SCALE, fitView, zoomTo, panBy, clampView, minScaleFor, screenToWorld,
} from './viewport.js';
import { bindGestures, suppressNativeZoom } from './gestures.js';
import { render, renderMinimap, resizeCanvas, computeGutters } from './renderer.js';
import { createMirror } from './a11yMirror.js';

const TAP_TOLERANCE_PX = 22;
const PADDING = 6;
/** Cell size the "comfortable" half of the fit toggle aims for. */
const COMFY_CELL_PX = 30;

export function createOverviewCanvas({
    canvas, minimap, mirrorHost, readoutPair, readoutCats, markButtons, fitButton,
    puzzle, cellKey, onActivate, onSelect,
}) {
    const layout = createLayout(puzzle, cellKey);
    const marks = new Map();
    const wrong = new Set();
    const context = canvas.getContext('2d');
    const minimapContext = minimap?.getContext('2d') ?? null;
    const byKey = new Map();
    // Keyboard and VoiceOver activate a mirror cell directly. Those users have
    // no crosshair to steer by, so activating also moves the selection - that
    // way the readout and the highlight follow wherever they are working.
    const mirror = createMirror(mirrorHost, layout, puzzle, {
        onActivate(key) {
            if (disabled) return;
            setSelected(byKey.get(key) ?? null);
            onActivate(key);
        },
    });
    const surface = canvas.parentElement;

    let view = { scale: 1, tx: 0, ty: 0 };
    let selected = null;
    let disabled = false;
    let cssWidth = 0;
    let cssHeight = 0;
    let dpr = 1;
    let frame = 0;
    let pinchBaseScale = 1;
    let gutters = computeGutters(0, 0);

    for (const cell of layout.cells) byKey.set(cell.key, cell);

    const limits = { minScale: minScaleFor(MIN_CELL_PX), maxScale: MAX_SCALE };
    const bounds = () => ({
        worldWidth: layout.width, worldHeight: layout.height,
        viewWidth: cssWidth, viewHeight: cssHeight,
        gutterLeft: gutters.left, gutterTop: gutters.top, padding: PADDING,
    });

    function schedule() {
        if (frame) return;
        frame = requestAnimationFrame(() => {
            frame = 0;
            if (!cssWidth || !cssHeight) return;
            render(context, {
                layout, view, puzzle, marks, wrong, selected, cssWidth, cssHeight, dpr, gutters,
            });
            if (minimapContext) {
                renderMinimap(minimapContext, {
                    layout, view, marks, gutters,
                    width: minimap.width, height: minimap.height,
                    cssWidth, cssHeight,
                });
            }
            mirror.position(view);
        });
    }

    function measure() {
        const rect = surface.getBoundingClientRect();
        cssWidth = rect.width;
        cssHeight = rect.height;
        gutters = computeGutters(cssWidth, cssHeight);
        // The minimap is a DOM element, so it needs the measured gutter too -
        // otherwise it parks on top of the column labels.
        surface.style.setProperty('--overview-gutter-top', `${gutters.top}px`);
        canvas.style.width = `${cssWidth}px`;
        canvas.style.height = `${cssHeight}px`;
        ({ dpr } = resizeCanvas(canvas, cssWidth, cssHeight));
    }

    function applyView(next) {
        view = clampView(next, { ...bounds(), minVisible: 60 });
        schedule();
    }

    function fitWhole() {
        measure();
        applyView(fitView(bounds()));
    }

    /**
     * One button, two states: see everything, or see it comfortably. At fit
     * scale on a phone the grid is a survey surface; a second press brings it to
     * a size that is pleasant to work in and leaves panning to do the rest.
     */
    function fit() {
        measure();
        const whole = fitView(bounds());
        const comfortable = COMFY_CELL_PX / CELL;
        const atWhole = Math.abs(view.scale - whole.scale) < 0.01;
        if (!atWhole || whole.scale >= comfortable - 0.01) { applyView(whole); return; }
        applyView(zoomTo(
            whole,
            gutters.left + (cssWidth - gutters.left) / 2,
            gutters.top + (cssHeight - gutters.top) / 2,
            comfortable, limits,
        ));
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
        // Both values always spelled out, so a cell's identity never depends on
        // the labels being legible at the current zoom.
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

    bindGestures(surface, {
        onTap({ x, y }) {
            if (disabled) return;
            // Taps inside the header gutters belong to the labels, not to a
            // cell. The hit test must mirror the way the gutters are drawn,
            // otherwise a tap on a label silently selects whatever sits behind.
            if (x < gutters.left || y < gutters.top) return;
            const world = screenToWorld(view, x, y);
            setSelected(hitTest(layout, world.x, world.y, view.scale, TAP_TOLERANCE_PX));
        },
        onPan({ dx, dy }) {
            applyView(panBy(view, dx, dy));
        },
        onPinchStart() {
            pinchBaseScale = view.scale;
        },
        onPinch({ centerX, centerY, scaleFromStart, dx, dy }) {
            const zoomed = zoomTo(view, centerX, centerY, pinchBaseScale * scaleFromStart, limits);
            applyView(panBy(zoomed, dx, dy));
        },
    });

    // touch-action: none is necessary but not sufficient on iOS; the
    // proprietary gesture events have to be cancelled as well.
    const releaseNativeZoom = suppressNativeZoom(surface);

    fitButton?.addEventListener('click', fit);

    // Deferred by a frame: the refit writes the canvas's own width and height,
    // and doing that synchronously inside the ResizeObserver callback makes
    // Safari and Chrome report "ResizeObserver loop completed with undelivered
    // notifications". Coalescing also collapses a burst of rotation events into
    // a single measure.
    let refitFrame = 0;
    const refit = () => {
        if (refitFrame) return;
        refitFrame = requestAnimationFrame(() => {
            refitFrame = 0;
            const previous = selected;
            fitWhole();
            // Rotation and toolbar collapse must not lose the player's place.
            if (previous) setSelected(previous);
        });
    };

    const observer = new ResizeObserver(refit);
    observer.observe(surface);
    // Safari's collapsing toolbar changes the visual viewport without changing
    // the layout viewport, so ResizeObserver alone can miss it.
    window.visualViewport?.addEventListener('resize', refit);

    return {
        fit: fitWhole,
        selected: () => selected,
        selectKey(key) {
            setSelected(byKey.get(key) ?? null);
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
            cancelAnimationFrame(refitFrame);
        },
    };
}
