/**
 * Accessible mirror of the canvas grid.
 *
 * A sibling DOM subtree rather than canvas fallback content: WebKit's fallback
 * accessibility story (bug 124592) has been unfinished since 2013, whereas an
 * ordinary subtree is well-trodden markup.
 *
 * Two rules matter more than anything else here:
 *
 *  - The ownership chain grid > row > gridcell stays pure and nothing is
 *    virtualized. Every documented VoiceOver grid failure comes from extra
 *    wrapper layers or recycled rows, and 250 cells is small enough not to need
 *    it.
 *  - The tree is mutated only when the puzzle state changes. Pan and zoom move
 *    ONE container transform; touching 250 nodes per frame is what makes
 *    assistive technology fall over, and it is not needed.
 *
 * Cells are transparent but geometrically real, because VoiceOver's direct-touch
 * exploration uses element geometry - a 1px clip box would send every touch to
 * the same place. Coordinates go into each accessible name rather than into
 * aria-rowindex/aria-colindex, which WebKit deferred exposing on iOS.
 */

import { CELL } from './geometry.js';
import { worldToScreen } from './viewport.js';

const MARK_TEXT = { yes: 'sichere Zuordnung', no: 'ausgeschlossen', maybe: 'vermutet' };

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
                node.style.left = `${cell.x}px`;
                node.style.top = `${cell.y}px`;
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

    const byKey = new Map(layout.cells.map(cell => [cell.key, cell]));

    function describe(key, mark, wrong) {
        const node = cells.get(key);
        const cell = byKey.get(key);
        if (!node || !cell) return;
        const rowCategory = puzzle.categories[cell.rowCategoryIndex];
        const colCategory = puzzle.categories[cell.colCategoryIndex];
        const state = mark ? MARK_TEXT[mark] : 'leer';
        node.setAttribute(
            'aria-label',
            `Zeile ${rowCategory.values[cell.rowValue]}, `
            + `Spalte ${colCategory.values[cell.colValue]}, ${state}`
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
        for (const node of cells.values()) {
            node.tabIndex = disabled ? -1 : (node === firstCell ? 0 : -1);
        }
    }

    // Every cell starts described, so nothing is announced as unlabelled before
    // the first paint reaches it.
    for (const cell of layout.cells) describe(cell.key, undefined, false);

    return {
        cells,
        position,
        describe,
        setDisabled,
        destroy() { host.replaceChildren(); },
    };
}
