/**
 * Pointer recogniser for grid cells.
 *
 * Why this exists rather than a plain click handler:
 *
 *  - Visual feedback must land on pointerdown. A cell that only reacts after
 *    pointerup feels laggy, which is most of what "unresponsive on mobile"
 *    actually means.
 *  - The mark must still be committed on pointerup, so that a swipe between
 *    pager pages, or a scroll of the overview grid, never toggles a cell it
 *    merely passed under.
 *  - Double-tap zoom and the 300ms tap delay are handled in CSS by
 *    `touch-action: manipulation` (styles/base.css); this module must not
 *    preventDefault() its way around them, or pinch-zoom would break too.
 *
 * Cells stay real <button> elements, so keyboard and VoiceOver activation keep
 * working through the plain click path.
 */

const MOVE_TOLERANCE_PX = 10;
const PRESSED_CLASS = 'is-pressed';

const supportsPointer = typeof window !== 'undefined' && 'PointerEvent' in window;

/**
 * Binds tap handling to a button.
 * @param {HTMLButtonElement} button
 * @param {() => void} onActivate invoked once per deliberate tap
 */
export function bindTapTarget(button, onActivate) {
    if (!supportsPointer) {
        button.addEventListener('click', onActivate);
        return;
    }

    let pointerId = null;
    let origin = null;
    let aborted = false;

    const release = () => {
        button.classList.remove(PRESSED_CLASS);
        if (pointerId !== null && button.hasPointerCapture(pointerId)) {
            button.releasePointerCapture(pointerId);
        }
        pointerId = null;
        origin = null;
    };

    button.addEventListener('pointerdown', event => {
        if (!event.isPrimary || button.disabled) return;
        // Ignore secondary mouse buttons; touch and pen report button 0.
        if (event.pointerType === 'mouse' && event.button !== 0) return;

        pointerId = event.pointerId;
        origin = { x: event.clientX, y: event.clientY };
        aborted = false;
        button.classList.add(PRESSED_CLASS);
        try { button.setPointerCapture(event.pointerId); } catch { /* capture is best effort */ }
    });

    button.addEventListener('pointermove', event => {
        if (pointerId !== event.pointerId || !origin || aborted) return;
        const dx = event.clientX - origin.x;
        const dy = event.clientY - origin.y;
        if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) {
            // The gesture turned into a scroll or a page swipe - stand down.
            aborted = true;
            button.classList.remove(PRESSED_CLASS);
        }
    });

    button.addEventListener('pointerup', event => {
        if (pointerId !== event.pointerId) return;
        const shouldActivate = !aborted && !button.disabled;
        release();
        if (shouldActivate) onActivate();
    });

    button.addEventListener('pointercancel', event => {
        if (pointerId !== event.pointerId) return;
        aborted = true;
        release();
    });

    // Keyboard activation still arrives as a click with no preceding pointer
    // sequence; pointer-driven clicks are ignored to avoid a double toggle.
    button.addEventListener('click', event => {
        if (event.detail === 0) onActivate();
    });
}
