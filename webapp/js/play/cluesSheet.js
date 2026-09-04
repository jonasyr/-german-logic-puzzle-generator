/**
 * Detented bottom sheet for the clue list (phone only; >= 900px it is a static
 * side column and every handler here becomes inert).
 *
 * The gesture contract, which is what makes it feel native:
 *
 *  - The peek height is measured from the real handle+header block, so the clue
 *    list never shows a sliver through the bottom of the screen.
 *  - Releasing a drag snaps to the NEAREST detent, with the throw projected from
 *    the release velocity. One long drag therefore goes peek -> full; you never
 *    have to drag twice.
 *  - The body only scrolls at the full detent. Below that its content is mostly
 *    off-screen, so letting it scroll just moves invisible content and leaves the
 *    user fighting the overscroll. At full, dragging down from scrollTop 0 hands
 *    the gesture back to the sheet and collapses it.
 */

import { make, clear } from '../dom.js';

const DETENTS = ['peek', 'half', 'full'];

/** Fraction of the sheet height translated away at each detent. */
const DETENT_FRACTION = { peek: null, half: 0.45, full: 0 };

/** A throw is projected this far ahead of the finger before snapping. */
const PROJECTION_MS = 120;

/** Downward flick past this speed always collapses, however short the drag. */
const DISMISS_VELOCITY = 0.5; // px/ms

export function createCluesSheet({ sheet, handle, header, toggle, list, backdrop, countNode, body }) {
    let detent = 'peek';

    const isSheetMode = () => getComputedStyle(sheet).position === 'fixed';

    /* --- Geometry --------------------------------------------------------- */

    /**
     * Height from the top of the sheet to the bottom of the header.
     *
     * Measured against the sheet's own box rather than by summing the two
     * children, so the sheet's top border - and any future margin - is included.
     * Summing offsetHeights missed the 1px border and clipped the header off the
     * bottom of the screen in landscape, where there is no slack to absorb it.
     * Kept fractional: rounding it leaves the CSS resting position and the
     * measured chrome a sub-pixel apart, which shows as a hairline of the clue
     * list or a hair of the header hanging past the bottom edge.
     */
    function chromeHeight() {
        return header.getBoundingClientRect().bottom - sheet.getBoundingClientRect().top;
    }

    /**
     * Keeps --sheet-peek equal to the actual chrome height, so the peek state
     * shows the grabber and the header and nothing of the list. A hard-coded
     * value drifts as soon as the text size or the safe-area inset changes.
     */
    /** Cached so the drag clamp never forces a layout on every pointermove. */
    let chrome = 0;

    function measurePeek() {
        chrome = chromeHeight();
        sheet.style.setProperty('--sheet-chrome', `${chrome}px`);
    }

    if ('ResizeObserver' in window) {
        const observer = new ResizeObserver(measurePeek);
        observer.observe(handle);
        observer.observe(header);
    }
    window.addEventListener('resize', measurePeek);
    measurePeek();

    /** translateY in px for a detent, measured against the sheet's own height. */
    function offsetFor(name) {
        const height = sheet.offsetHeight;
        // The header already carries the safe-area inset, so the peek is exactly
        // the chrome height and no part of the list shows through.
        if (name === 'peek') return Math.max(0, height - chrome);
        return height * DETENT_FRACTION[name];
    }

    function nearestDetent(offset) {
        let best = DETENTS[0];
        let bestDistance = Infinity;
        for (const name of DETENTS) {
            const distance = Math.abs(offsetFor(name) - offset);
            if (distance < bestDistance) { bestDistance = distance; best = name; }
        }
        return best;
    }

    /* --- State ------------------------------------------------------------ */

    function setDetent(next) {
        detent = next;
        sheet.dataset.detent = next;
        sheet.classList.remove('is-dragging');
        sheet.style.transform = '';
        backdrop.classList.toggle('is-open', next !== 'peek');
        toggle.setAttribute('aria-expanded', next === 'peek' ? 'false' : 'true');
        // Leaving the full detent must not strand the body mid-scroll, or
        // reopening starts somewhere arbitrary.
        if (next !== 'full') body.scrollTop = 0;
    }

    function cycle() {
        if (!isSheetMode()) return;
        setDetent(detent === 'full' ? 'peek' : detent === 'half' ? 'full' : 'half');
    }

    // The header is both a button and a drag surface, so a drag would otherwise
    // be followed by a click and move the sheet twice.
    let suppressClick = false;

    toggle.addEventListener('click', () => {
        if (suppressClick) { suppressClick = false; return; }
        cycle();
    });
    backdrop.addEventListener('click', () => setDetent('peek'));

    /* --- Drag ------------------------------------------------------------- */

    let drag = null;

    function currentOffset() {
        return new DOMMatrixReadOnly(getComputedStyle(sheet).transform).m42;
    }

    function beginDrag(event, { fromBody = false } = {}) {
        if (!isSheetMode() || !event.isPrimary) return;
        drag = {
            pointerId: event.pointerId,
            startY: event.clientY,
            lastY: event.clientY,
            lastTime: event.timeStamp,
            velocity: 0,
            startOffset: currentOffset(),
            fromBody,
        };
        sheet.classList.add('is-dragging');
    }

    function moveDrag(event) {
        if (!drag || drag.pointerId !== event.pointerId) return;

        const elapsed = event.timeStamp - drag.lastTime;
        if (elapsed > 0) drag.velocity = (event.clientY - drag.lastY) / elapsed;
        drag.lastY = event.clientY;
        drag.lastTime = event.timeStamp;

        const offset = Math.min(
            Math.max(drag.startOffset + (event.clientY - drag.startY), 0),
            offsetFor('peek'),
        );
        sheet.style.transform = `translateY(${offset}px)`;
        event.preventDefault();
    }

    function endDrag(event) {
        if (!drag || drag.pointerId !== event.pointerId) return;

        // Anything past a few pixels was a drag, not a tap on the header.
        if (Math.abs(event.clientY - drag.startY) > 8) suppressClick = true;

        const offset = Math.min(
            Math.max(drag.startOffset + (event.clientY - drag.startY), 0),
            offsetFor('peek'),
        );
        const velocity = drag.velocity;
        drag = null;
        sheet.classList.remove('is-dragging');

        // A decisive downward flick collapses whatever the distance.
        if (velocity > DISMISS_VELOCITY) { setDetent('peek'); return; }

        // Otherwise snap to whichever detent the throw is heading for. Using the
        // projected position rather than the neighbouring index is what lets a
        // single long drag travel peek -> full.
        setDetent(nearestDetent(offset + velocity * PROJECTION_MS));
    }

    function cancelDrag() {
        if (!drag) return;
        drag = null;
        sheet.classList.remove('is-dragging');
        setDetent(detent);
    }

    for (const surface of [handle, header]) {
        surface.addEventListener('pointerdown', event => {
            beginDrag(event);
            if (drag) {
                try { surface.setPointerCapture(event.pointerId); } catch { /* best effort */ }
            }
        });
        surface.addEventListener('pointermove', moveDrag);
        surface.addEventListener('pointerup', endDrag);
        surface.addEventListener('pointercancel', cancelDrag);
    }

    // At the full detent the body scrolls. A downward drag that starts when the
    // body is already at the top means "close the sheet", not "scroll further
    // up", so the gesture is handed to the sheet.
    body.addEventListener('pointerdown', event => {
        if (detent !== 'full' || body.scrollTop > 0) return;
        beginDrag(event, { fromBody: true });
    });
    body.addEventListener('pointermove', event => {
        if (!drag || !drag.fromBody) return;
        // An upward drag at the top is a normal scroll; stand down and let it be.
        if (event.clientY < drag.startY) { cancelDrag(); return; }
        moveDrag(event);
    });
    body.addEventListener('pointerup', event => { if (drag?.fromBody) endDrag(event); });
    body.addEventListener('pointercancel', () => { if (drag?.fromBody) cancelDrag(); });

    return {
        setDetent,
        collapse: () => setDetent('peek'),
        currentDetent: () => detent,

        /** Renders the clue list; tapping a clue dims it as "already used". */
        render(clues, usedClues, onToggleUsed) {
            clear(list);
            clues.forEach((clue, index) => {
                const item = make('li');
                if (usedClues.has(index)) item.classList.add('is-used');

                const button = make('button', { text: clue, attrs: { type: 'button' } });
                button.setAttribute('aria-pressed', usedClues.has(index) ? 'true' : 'false');
                button.addEventListener('click', () => {
                    const used = !usedClues.has(index);
                    if (used) usedClues.add(index); else usedClues.delete(index);
                    item.classList.toggle('is-used', used);
                    button.setAttribute('aria-pressed', used ? 'true' : 'false');
                    onToggleUsed?.();
                });

                item.append(button);
                list.append(item);
            });
            if (countNode) countNode.textContent = `(${clues.length})`;
            measurePeek();
        },
    };
}
