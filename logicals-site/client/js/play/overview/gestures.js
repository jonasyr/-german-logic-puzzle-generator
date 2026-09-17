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
        const centre = started ? midpoint(pointers) : null;
        return {
            state: {
                ...state, pointers, multiTouch,
                pinch: started ? { ...centre, startDistance: centre.distance } : state.pinch,
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
    // finger rather than from the vanished midpoint. Without this the view jumps
    // by the midpoint-to-finger offset the moment a finger lifts.
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
