/**
 * World layout for the overview.
 *
 * Everything here is in world units and independent of zoom: the viewport
 * transform is the only thing that turns these into pixels. That separation is
 * the whole point - the old table overview derived position from table layout,
 * scale from CSS `zoom` and offset from scrollLeft, and those three could not be
 * kept in agreement.
 */

/** World units per cell. Arbitrary but fixed; only ratios matter. */
export const CELL = 40;

/** World units between two blocks. */
export const BLOCK_GAP = 6;

/**
 * Smallest visual cell at which a tap can still be attributed unambiguously.
 * Measured, not assumed: below 12.5px a +/-6px finger error puts the
 * neighbouring cell genuinely nearer, and no hit-testing scheme recovers from
 * that. See docs/superpowers/specs/2026-09-17-mobile-canvas-overview-design.md.
 */
export const MIN_CELL_PX = 12.5;

/** Column blocks run over categories 1..n-1, rows over the first and then the rest. */
export function gridAxes(count) {
    const columns = [];
    for (let index = 1; index < count; index++) columns.push(index);
    const rows = [0];
    for (let index = count - 1; index >= 2; index--) rows.push(index);
    return { columns, rows };
}

/** The grid is triangular: each row block drops one column block. */
export function blockVisible(rowBlock, colBlock, columnCount) {
    return colBlock < columnCount - rowBlock;
}

function blockOrigin(block, valueCount) {
    return block * (valueCount * CELL + BLOCK_GAP);
}

export function createLayout(puzzle, cellKey) {
    const { columns, rows } = gridAxes(puzzle.categories.length);
    const valueCount = puzzle.categories[0].values.length;
    const cells = [];

    rows.forEach((rowCategoryIndex, rowBlock) => {
        columns.forEach((colCategoryIndex, colBlock) => {
            if (!blockVisible(rowBlock, colBlock, columns.length)) return;
            for (let rowValue = 0; rowValue < valueCount; rowValue++) {
                for (let colValue = 0; colValue < valueCount; colValue++) {
                    cells.push({
                        key: cellKey(rowCategoryIndex, rowValue, colCategoryIndex, colValue),
                        rowBlock, rowValue, colBlock, colValue,
                        rowCategoryIndex, colCategoryIndex,
                        x: blockOrigin(colBlock, valueCount) + colValue * CELL,
                        y: blockOrigin(rowBlock, valueCount) + rowValue * CELL,
                    });
                }
            }
        });
    });

    const span = block => blockOrigin(block, valueCount) + valueCount * CELL;
    return {
        columns, rows, valueCount, cells,
        width: span(columns.length - 1),
        height: span(rows.length - 1),
    };
}

/**
 * Nearest cell to a world point, accepted only if the point lies inside the cell
 * or within `tolerancePx` SCREEN pixels of it.
 *
 * The tolerance is measured on screen rather than in world units, which is what
 * makes a 13px cell as tappable as a 44px one: the visual size shrinks with the
 * zoom, the finger does not.
 */
export function hitTest(layout, worldX, worldY, scale, tolerancePx) {
    let best = null;
    let bestDistance = Infinity;

    for (const cell of layout.cells) {
        const dx = worldX - (cell.x + CELL / 2);
        const dy = worldY - (cell.y + CELL / 2);
        const distance = Math.hypot(dx, dy);
        if (distance < bestDistance) { bestDistance = distance; best = cell; }
    }
    if (!best) return null;

    // Half a cell of "inside", plus the finger slop, both in screen pixels.
    const reach = (CELL / 2) * scale + tolerancePx;
    return bestDistance * scale <= reach ? best : null;
}
