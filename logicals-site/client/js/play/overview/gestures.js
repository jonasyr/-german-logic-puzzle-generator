/**
 * Gesture arbitration for the overview viewport.
 *
 * The recogniser is a pure reducer so it can be tested without a DOM; the binder
 * underneath it is deliberately thin. One surface owns all three gestures, which
 * is the point: the old overview ran a touchmove pinch on top of a native
 * scroller that was also claiming pan-x/pan-y, so two mechanisms fought over
 * every gesture.
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

/**
 * The two pointers a pinch is measured between, in the order they arrived.
 *
 * Which two matters, and it has to be remembered. Taking "whichever two the map
 * yields first" silently changed the pair the moment a third finger landed or
 * one of the two lifted - while the baseline distance stayed - and the ratio
 * then had no relation to any real gesture. That is what threw the grid to a
 * wild scale and position.
 */
function pinchIds(pointers) {
    const ids = [...pointers.keys()];
    return ids.length >= 2 ? [ids[0], ids[1]] : null;
}

function measurePair(pointers, [a, b]) {
    const first = pointers.get(a);
    const second = pointers.get(b);
    return {
        x: (first.x + second.x) / 2,
        y: (first.y + second.y) / 2,
        // Floored at 1: two fingers touching each other report a near-zero
        // distance, which makes the ratio explode.
        distance: Math.max(1, Math.hypot(first.x - second.x, first.y - second.y)),
    };
}

/** A fresh baseline for whichever pair is currently active. */
function seedPinch(pointers) {
    const ids = pinchIds(pointers);
    if (!ids) return null;
    const measured = measurePair(pointers, ids);
    return { a: ids[0], b: ids[1], ...measured, startDistance: measured.distance };
}

const samePair = (pinch, ids) => Boolean(pinch && ids && pinch.a === ids[0] && pinch.b === ids[1]);

/**
 * Re-seeds whenever the active pair changes, and reports whether it did - the
 * caller turns that into a `pinchstart`, so the component re-reads the scale the
 * new gesture is measured from.
 */
function reconcilePinch(state, pointers) {
    const ids = pinchIds(pointers);
    if (!ids) return { pinch: null, reseeded: false };
    if (samePair(state.pinch, ids)) return { pinch: state.pinch, reseeded: false };
    return { pinch: seedPinch(pointers), reseeded: true };
}

export function reduce(state, event) {
    const pointers = new Map(state.pointers);

    if (event.type === 'down') {
        pointers.set(event.id, { x: event.x, y: event.y });
        const multiTouch = state.multiTouch || pointers.size > 1;
        // A third finger - a palm, a resting thumb - changes which pair is being
        // measured, so the baseline has to be taken again.
        const { pinch, reseeded } = reconcilePinch(state, pointers);
        return {
            state: {
                ...state, pointers, multiTouch, pinch,
                moved: state.moved,
                origin: pointers.size === 1 ? { x: event.x, y: event.y } : state.origin,
            },
            action: reseeded ? { type: 'pinchstart' } : null,
        };
    }

    if (event.type === 'move') {
        const previous = pointers.get(event.id);
        if (!previous) return { state, action: null };
        pointers.set(event.id, { x: event.x, y: event.y });

        if (pointers.size >= 2) {
            const { pinch, reseeded } = reconcilePinch(state, pointers);
            if (reseeded) {
                return {
                    state: { ...state, pointers, pinch, moved: true },
                    action: { type: 'pinchstart' },
                };
            }
            // Only a pointer belonging to the measured pair moves the pinch; a
            // third finger drifting must not drag the grid with it.
            if (event.id !== pinch.a && event.id !== pinch.b) {
                return { state: { ...state, pointers, moved: true }, action: null };
            }
            const next = measurePair(pointers, [pinch.a, pinch.b]);
            return {
                state: {
                    ...state, pointers, moved: true,
                    // startDistance and the pair are carried through untouched;
                    // only the midpoint moves frame to frame.
                    pinch: { ...pinch, ...next },
                },
                action: {
                    type: 'pinch',
                    centerX: next.x, centerY: next.y,
                    scaleFromStart: next.distance / pinch.startDistance,
                    dx: next.x - pinch.x,
                    dy: next.y - pinch.y,
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

    if (wasLast) {
        return {
            state: createGestureState(),
            action: isTap ? { type: 'tap', x: event.x, y: event.y } : null,
        };
    }

    // Dropping to a single pointer re-seeds the survivor: its stored position is
    // its last real one, so the next pan delta is measured from the finger
    // rather than from the vanished midpoint. Dropping from three to two instead
    // leaves a different PAIR, which needs a fresh baseline.
    const { pinch, reseeded } = reconcilePinch(state, pointers);
    return {
        state: { ...state, pointers, pinch, moved: true },
        action: reseeded ? { type: 'pinchstart' } : null,
    };
}

/**
 * Feeds pointer events through the reducer. `touch-action: none` on the element
 * is what stops Safari claiming the gesture first; it is set in CSS, on the
 * viewport element only, so the rest of the page scrolls normally.
 */
export function bindGestures(element, { onTap, onPan, onPinchStart, onPinch }) {
    let state = createGestureState();

    const dispatch = (type, event) => {
        // A release for a pointer we are not tracking is noise - it would delete
        // nothing and could emit a phantom tap. This matters because releases
        // are now heard from two places, see below.
        if (type !== 'down' && !state.pointers.has(event.pointerId)) return;

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

    /*
     * A second, wider net for releases.
     *
     * iOS drops a pointerup often enough to matter - WebKit only fixed one such
     * case in Safari 26.4 - and a pointer that is never released stays in the
     * map as a ghost. The next finger down then pairs with the ghost, the pinch
     * takes its baseline from a distance that no longer exists, and the grid
     * leaps to a wild scale. Hearing releases on the window as well, and
     * treating a lost capture as a cancel, means a stuck pointer needs BOTH
     * routes to fail.
     */
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    element.addEventListener('lostpointercapture', onCancel);

    return () => {
        element.removeEventListener('pointerdown', onDown);
        element.removeEventListener('pointermove', onMove);
        element.removeEventListener('pointerup', onUp);
        element.removeEventListener('pointercancel', onCancel);
        element.removeEventListener('lostpointercapture', onCancel);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
    };
}

/**
 * Cancels WebKit's proprietary gesture events so Safari cannot zoom the page.
 *
 * Bound to the DOCUMENT, not to the canvas. A two-finger gesture targets the
 * element under the first touch - or the common ancestor when the fingers
 * straddle two elements - so a pinch that starts half on the grid and half on
 * the padding beside it never reached a listener on the canvas, and Safari
 * zoomed the whole page. That is the failure that makes the board look like it
 * has exploded: the layout has not changed at all, you are just looking at a
 * magnified, cropped page.
 *
 * `touch-action: none` does not cover this on its own, and a passive listener
 * cannot cancel anything - hence { passive: false }. We only cancel;
 * `event.scale` is deliberately unused, because on iOS these fire alongside the
 * pointer events for the same pinch and acting on both produces conflicting
 * state. tldraw and Excalidraw both took this route.
 *
 * @param {Document|Element} root
 * @param {{ exempt?: string, enabled?: () => boolean }} options
 *   `enabled` gates the whole thing, so leaving the play screen restores normal
 *   behaviour everywhere else in the app. `exempt` is a selector whose subtree
 *   keeps native zoom; the play screen passes none, because a pinch there means
 *   the grid and never the page.
 */
export function suppressNativeZoom(root, { exempt, enabled } = {}) {
    // gestureend is documented to fire twice, so the latch keeps it idempotent.
    let active = false;

    const applies = event => {
        if (enabled && !enabled()) return false;
        if (!exempt) return true;
        const target = event.target;
        return !(target instanceof Element) || !target.closest(exempt);
    };

    const cancel = event => {
        if (event.cancelable !== false) event.preventDefault();
    };
    const onStart = event => {
        if (!applies(event)) return;
        active = true;
        cancel(event);
    };
    const onChange = event => { if (active) cancel(event); };
    const onEnd = event => { if (!active) return; active = false; cancel(event); };

    root.addEventListener('gesturestart', onStart, { passive: false });
    root.addEventListener('gesturechange', onChange, { passive: false });
    root.addEventListener('gestureend', onEnd, { passive: false });

    return () => {
        root.removeEventListener('gesturestart', onStart);
        root.removeEventListener('gesturechange', onChange);
        root.removeEventListener('gestureend', onEnd);
    };
}

/**
 * Kills a double tap before the browser can read one.
 *
 * `touch-action: pan-x pan-y` on the play screen and the cancelled gesture
 * events between them are supposed to be enough. They are not: rapid repeated
 * tapping still nudges the page zoom on iOS, and once nudged it does not come
 * back on its own, which is what makes it infuriating rather than merely odd.
 *
 * So the screen also refuses the second `touchend` of any pair that lands within
 * `DOUBLE_TAP_MS`. That is the oldest and bluntest of the three, and it works
 * even where the other two are disregarded.
 *
 * preventDefault on touchend suppresses the synthetic click that follows, so
 * anything that needs one is left alone - the tool buttons, the clue list, the
 * sheet header. Those carry `touch-action: manipulation` of their own, which
 * already denies them a double-tap zoom. What is left is the inert space
 * between them, which is where a stray double tap actually lands.
 */
const DOUBLE_TAP_MS = 400;
const NEEDS_CLICK = 'button, a, input, select, textarea, label, summary, [role="button"], dialog';

export function suppressDoubleTapZoom(element) {
    let previous = 0;

    const onTouchEnd = event => {
        const now = event.timeStamp || Date.now();
        const close = now - previous < DOUBLE_TAP_MS;
        previous = now;
        if (!close || event.cancelable === false) return;
        const target = event.target;
        if (target instanceof Element && target.closest(NEEDS_CLICK)) return;
        event.preventDefault();
    };

    element.addEventListener('touchend', onTouchEnd, { passive: false });
    return () => element.removeEventListener('touchend', onTouchEnd);
}
