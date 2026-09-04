/**
 * Detented bottom sheet for the clue list (phone only; >= 900px it is a static
 * side column and every handler here becomes inert).
 *
 * The clue list used to sit ~930px below the grid, so every clue meant scrolling
 * down to read and back up to mark. The sheet keeps both on screen at once.
 */

import { make, clear } from '../dom.js';

const DETENTS = ['peek', 'half', 'full'];

export function createCluesSheet({ sheet, handle, toggle, list, backdrop, countNode }) {
    let detent = 'peek';

    const isSheetMode = () => getComputedStyle(sheet).position === 'fixed';

    function setDetent(next) {
        detent = next;
        sheet.dataset.detent = next;
        sheet.classList.remove('is-dragging');
        sheet.style.transform = '';
        backdrop.classList.toggle('is-open', next !== 'peek');
        toggle.setAttribute('aria-expanded', next === 'peek' ? 'false' : 'true');
    }

    function cycle() {
        if (!isSheetMode()) return;
        setDetent(detent === 'peek' ? 'half' : detent === 'half' ? 'full' : 'peek');
    }

    toggle.addEventListener('click', cycle);
    backdrop.addEventListener('click', () => setDetent('peek'));

    // --- Drag ---------------------------------------------------------------
    let dragging = null;

    /** Current translateY in px, read from the settled detent transform. */
    function currentOffset() {
        const matrix = new DOMMatrixReadOnly(getComputedStyle(sheet).transform);
        return matrix.m42;
    }

    handle.addEventListener('pointerdown', event => {
        if (!isSheetMode() || !event.isPrimary) return;
        dragging = { startY: event.clientY, startOffset: currentOffset() };
        sheet.classList.add('is-dragging');
        try { handle.setPointerCapture(event.pointerId); } catch { /* best effort */ }
    });

    handle.addEventListener('pointermove', event => {
        if (!dragging) return;
        const delta = event.clientY - dragging.startY;
        // Never drag above the fully open position or below fully closed.
        const offset = Math.min(
            Math.max(dragging.startOffset + delta, 0),
            sheet.offsetHeight,
        );
        sheet.style.transform = `translateY(${offset}px)`;
    });

    function endDrag(event) {
        if (!dragging) return;
        const delta = event.clientY - dragging.startY;
        dragging = null;
        sheet.classList.remove('is-dragging');
        sheet.style.transform = '';

        // Snap to the neighbouring detent once the drag passes a threshold.
        const index = DETENTS.indexOf(detent);
        if (delta < -40) setDetent(DETENTS[Math.min(index + 1, DETENTS.length - 1)]);
        else if (delta > 40) setDetent(DETENTS[Math.max(index - 1, 0)]);
        else setDetent(detent);
    }

    handle.addEventListener('pointerup', endDrag);
    handle.addEventListener('pointercancel', () => {
        dragging = null;
        sheet.classList.remove('is-dragging');
        sheet.style.transform = '';
        setDetent(detent);
    });

    return {
        setDetent,
        collapse: () => setDetent('peek'),

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
        },
    };
}
