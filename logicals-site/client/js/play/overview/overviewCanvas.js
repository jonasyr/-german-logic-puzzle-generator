/**
 * The overview: one canvas, one world, one gesture owner.
 *
 * Marking is a TOOL model, not a cycle. One of x / o / erase is armed, and a tap
 * writes it. Armed on the cell's existing value, a tap clears it instead, so
 * every tool is a two-state switch and correcting always costs exactly one tap.
 *
 * Why not cycle on tap: four marks in five are crosses - a solved 5x5 has 200 of
 * them against 50 circles - so cycling barely saves taps, and it turns a mis-tap
 * on an already-marked cell into a silent circle. At a 12.5px cell that is the
 * mistake people actually make. Writing the same value twice is harmless.
 *
 * Tapping the armed tool disarms it; a tap then only selects, which is how you
 * inspect a cell without changing it.
 *
 * What keeps any of this workable at 12.5px is that the tap is resolved by
 * nearest-centre hit testing with a screen-space tolerance rather than by the
 * cell's own box, so the touch target never shrinks with the zoom. The tool
 * buttons are ordinary 44px controls, which is also what makes the small cells
 * conforming under WCAG 2.2 SC 2.5.8's "equivalent control" exception.
 */

import { CELL, MIN_CELL_PX, createLayout, hitTest } from './geometry.js';
import {
    MAX_SCALE, fitView, zoomTo, panBy, clampView, minScaleFor, screenToWorld,
} from './viewport.js';
import { bindGestures, suppressDoubleTapZoom, suppressNativeZoom } from './gestures.js';
import { render, renderMinimap, resizeCanvas, computeGutters, readPalette } from './renderer.js';
import { createMirror } from './a11yMirror.js';
import { nextMark } from '../markTool.js';

const TAP_TOLERANCE_PX = 22;
const PADDING = 6;
/** Cell size the "comfortable" half of the fit toggle aims for. */
const COMFY_CELL_PX = 30;

export function createOverviewCanvas({
    canvas, minimap, mirrorHost, readoutPair, readoutCats, fitButton,
    puzzle, cellKey, currentTool, onSetMark, onSelect,
}) {
    const layout = createLayout(puzzle, cellKey);
    const marks = new Map();
    const wrong = new Set();
    let conflicts = new Set();
    const context = canvas.getContext('2d');
    const minimapContext = minimap?.getContext('2d') ?? null;
    const byKey = new Map();
    // Keyboard and VoiceOver activate a mirror cell directly. Those users have
    // no crosshair to steer by, so activating also moves the selection - that
    // way the readout and the highlight follow wherever they are working.
    const mirror = createMirror(mirrorHost, layout, puzzle, {
        // Keyboard and VoiceOver go through the same tool, so the two input
        // routes cannot disagree about what a cell is worth.
        onActivate(key) {
            if (disabled) return;
            applyTool(byKey.get(key) ?? null);
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
    let gutters = { left: 62, top: 52 };
    let colors = null;

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
                layout, view, puzzle, marks, wrong, conflicts, selected,
                cssWidth, cssHeight, dpr, gutters, colors,
            });
            if (minimapContext) {
                renderMinimap(minimapContext, {
                    layout, view, marks, gutters, colors,
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
        gutters = computeGutters(context, layout, puzzle, cssWidth, cssHeight);
        colors = readPalette(surface);
        // Published so the DOM side - the minimap's placement, and the tests -
        // reads the same numbers the canvas draws with instead of guessing.
        surface.style.setProperty('--overview-gutter-left', `${gutters.left}px`);
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
        if (!selected) {
            readoutPair.textContent = 'Keine Zelle gewählt';
            /*
             * Keine zweite Auskunft ueber dasselbe Werkzeug.
             *
             * Hier stand "TIPPEN MARKIERT" beziehungsweise "Tippen waehlt nur
             * aus". Seit die Statuszeile ueber dem Gitter im Ruhezustand sagt,
             * was ein Tipp bewirkt ("Tippen schliesst aus."), stand dieselbe
             * Aussage zweimal auf einem Bildschirm - hier in Versalien und
             * ungenauer. Diese Zeile fuellt jetzt ihren eigenen Zweck: die
             * Aufforderung, ueberhaupt eine Zelle zu waehlen.
             */
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

    /** Selects the cell and writes whatever the armed tool says to write. */
    function applyTool(cell) {
        setSelected(cell);
        if (!cell) return;
        const mark = nextMark(marks.get(cell.key), currentTool());
        if (mark !== undefined) onSetMark(cell.key, mark);
    }

    function setSelected(cell) {
        selected = cell;
        renderReadout();
        onSelect?.(cell ? cell.key : null);
        schedule();
    }

    const releaseGestures = bindGestures(surface, {
        onTap({ x, y }) {
            if (disabled) return;
            // Taps inside the header gutters belong to the labels, not to a
            // cell. The hit test must mirror the way the gutters are drawn,
            // otherwise a tap on a label silently selects whatever sits behind.
            if (x < gutters.left || y < gutters.top) return;
            const world = screenToWorld(view, x, y);
            applyTool(hitTest(layout, world.x, world.y, view.scale, TAP_TOLERANCE_PX));
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

    // touch-action: none is necessary but not sufficient on iOS, and binding the
    // gesture events to the canvas was not enough either: a pinch straddling the
    // grid and the space beside it targets a common ancestor and never reached
    // the canvas's listener, so Safari zoomed the page instead. Bound to the
    // document, gated on the play screen being the active one, and exempting the
    // clue sheet so its text can still be magnified.
    // A third guard, across the whole play screen rather than just the board:
    // rapid repeated tapping still nudged the page zoom on iOS even with
    // touch-action and the gesture events both in place, and it does not come
    // back by itself.
    const releaseDoubleTap = suppressDoubleTapZoom(
        document.getElementById('screen-play') ?? surface,
    );

    const releaseNativeZoom = suppressNativeZoom(document, {
        enabled: () => document.getElementById('screen-play')?.classList.contains('is-active'),
    });

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
            const rect = surface.getBoundingClientRect();
            // Only react when the box genuinely changed size. Safari fires
            // visualViewport resize for page pinch-zoom too, where the layout box
            // does not move.
            if (Math.abs(rect.width - cssWidth) < 0.5 && Math.abs(rect.height - cssHeight) < 0.5) {
                return;
            }

            /*
             * Keep the player where they were.
             *
             * The grid resizes for reasons that have nothing to do with the
             * player: the status line appears after Pruefen and disappears on the
             * next mark, and each time the stage reflows by a line. Refitting on
             * every one of those threw away whatever they had zoomed to, which
             * made the view feel like it kept snapping back on its own.
             *
             * A view still at fit scale is re-fitted, because that is what the
             * player is looking at and a rotation should re-fill the screen. A
             * zoomed view keeps its scale and stays centred on the same part of
             * the puzzle.
             */
            const wasFitted = cssWidth > 0
                && Math.abs(view.scale - fitView(bounds()).scale) < 0.01;
            const centre = cssWidth > 0
                ? screenToWorld(view, (gutters.left + cssWidth) / 2, (gutters.top + cssHeight) / 2)
                : null;

            measure();

            if (!centre || wasFitted) {
                applyView(fitView(bounds()));
            } else {
                const x = (gutters.left + cssWidth) / 2;
                const y = (gutters.top + cssHeight) / 2;
                applyView({
                    scale: view.scale,
                    tx: x - centre.x * view.scale,
                    ty: y - centre.y * view.scale,
                });
            }
            if (selected) setSelected(selected);
        });
    };

    // Repaint when the system flips between light and dark, so the grid does not
    // stay in the palette it happened to start in.
    const scheme = window.matchMedia('(prefers-color-scheme: dark)');
    const onScheme = () => { colors = readPalette(surface); schedule(); };
    scheme.addEventListener('change', onScheme);

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
        /** Recomputed by the controller after every change; 250 cells is nothing. */
        setConflicts(next) { conflicts = next; schedule(); },
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
            scheme.removeEventListener('change', onScheme);
            releaseGestures();
            releaseDoubleTap();
            releaseNativeZoom();
            mirror.destroy();
            cancelAnimationFrame(frame);
            cancelAnimationFrame(refitFrame);
        },
    };
}
