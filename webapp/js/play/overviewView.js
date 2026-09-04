/**
 * The whole grid in one table - the tablet/desktop view, and the phone's
 * "Gesamtansicht" for cross-deduction.
 *
 * The row and column headers are sticky (styles/play.css). Without that, the
 * labels scroll out of the 334px-wide viewport along with the content and you
 * lose track of which row you are marking, which was the worst part of the old
 * mobile experience.
 */

import { make, clear } from '../dom.js';
import { bindTapTarget } from './tapTarget.js';

const ZOOM_STEPS = [0.6, 0.75, 0.9, 1, 1.15, 1.35];

/** Column blocks run over categories 2..n, rows over the first and then the rest. */
export function gridAxes(count) {
    const columns = [];
    for (let index = 1; index < count; index++) columns.push(index);
    const rows = [0];
    for (let index = count - 1; index >= 2; index--) rows.push(index);
    return { columns, rows };
}

/**
 * @returns {{ cells: Map<string, HTMLButtonElement> }}
 */
export function buildOverview(puzzle, container, { cellKey, onActivate }) {
    const { columns, rows } = gridAxes(puzzle.categories.length);
    const valueCount = puzzle.categories[0].values.length;
    const cells = new Map();

    const table = make('table', { className: 'grid-table' });

    const head = make('thead');
    const catRow = make('tr');
    const catSpacer = make('td', { className: 'void' });
    catSpacer.colSpan = 2;
    catRow.append(catSpacer);
    for (const categoryIndex of columns) {
        const cell = make('th', { className: 'cat-head', text: puzzle.categories[categoryIndex].label });
        cell.colSpan = valueCount;
        cell.scope = 'colgroup';
        catRow.append(cell);
    }

    const valueRow = make('tr');
    const valueSpacer = make('td', { className: 'void' });
    valueSpacer.colSpan = 2;
    valueRow.append(valueSpacer);
    for (const categoryIndex of columns) {
        for (const value of puzzle.categories[categoryIndex].values) {
            const cell = make('th', { className: 'val-head', text: value });
            cell.scope = 'col';
            valueRow.append(cell);
        }
    }
    head.append(catRow, valueRow);

    const body = make('tbody');
    rows.forEach((rowCategoryIndex, rowBlock) => {
        const rowCategory = puzzle.categories[rowCategoryIndex];
        const visibleBlocks = columns.length - rowBlock;

        rowCategory.values.forEach((rowValue, rowValueIndex) => {
            const tr = make('tr');
            if (rowValueIndex === 0) {
                const side = make('th', { className: 'cat-side', text: rowCategory.label });
                side.rowSpan = valueCount;
                side.scope = 'rowgroup';
                tr.append(side);
            }
            tr.append(make('th', { className: 'val-side', text: rowValue, attrs: { scope: 'row' } }));

            columns.slice(0, visibleBlocks).forEach(colCategoryIndex => {
                const colCategory = puzzle.categories[colCategoryIndex];
                colCategory.values.forEach((colValue, colValueIndex) => {
                    const classes = [];
                    if (colValueIndex === 0) classes.push('block-start');
                    if (colValueIndex === valueCount - 1) classes.push('block-end');
                    if (rowValueIndex === 0) classes.push('row-start');
                    if (rowValueIndex === valueCount - 1) classes.push('row-end');
                    const td = make('td', { className: classes.join(' ') });

                    const key = cellKey(rowCategoryIndex, rowValueIndex, colCategoryIndex, colValueIndex);
                    const button = make('button', { className: 'cell', attrs: { type: 'button' } });
                    button.dataset.label = `${rowValue} / ${colValue}`;
                    button.dataset.key = key;
                    bindTapTarget(button, () => onActivate(key));
                    cells.set(key, button);
                    td.append(button);
                    tr.append(td);
                });
            });

            const hiddenBlocks = columns.length - visibleBlocks;
            if (hiddenBlocks > 0) {
                const filler = make('td', { className: 'void' });
                filler.colSpan = hiddenBlocks * valueCount;
                tr.append(filler);
            }
            body.append(tr);
        });
    });

    table.append(head, body);
    clear(container).append(table);

    measureStickyOffsets(container, table);
    return { cells };
}

/**
 * Sticky offsets must match the real rendered header sizes, otherwise the second
 * header row overlaps the first when the grid is scrolled.
 */
function measureStickyOffsets(container, table) {
    requestAnimationFrame(() => {
        const catHead = table.querySelector('.cat-head');
        const catSide = table.querySelector('.cat-side');
        if (catHead) container.style.setProperty('--cat-head-h', `${Math.ceil(catHead.getBoundingClientRect().height)}px`);
        if (catSide) container.style.setProperty('--cat-side-w', `${Math.ceil(catSide.getBoundingClientRect().width)}px`);
    });
}

/**
 * A discrete zoom stepper. Native pinch-zoom still works on the page; this is
 * the reliable, discoverable control that does not depend on gesture maths.
 */
export function createZoom(zoomNode, output) {
    let index = ZOOM_STEPS.indexOf(1);

    function apply() {
        const scale = ZOOM_STEPS[index];

        // Measure at scale 1 first: reading scrollHeight while an explicit height
        // is set would compound on every step.
        zoomNode.style.height = '';
        zoomNode.style.transform = '';
        const naturalHeight = zoomNode.scrollHeight;

        if (scale !== 1) {
            zoomNode.style.transform = `scale(${scale})`;
            // transform does not affect layout, so the scroll container needs to
            // be told how tall the scaled content actually is.
            zoomNode.style.height = `${naturalHeight * scale}px`;
        }
        if (output) output.textContent = `${Math.round(scale * 100)}%`;
    }

    return {
        in() { index = Math.min(index + 1, ZOOM_STEPS.length - 1); apply(); },
        out() { index = Math.max(index - 1, 0); apply(); },
        reset() { index = ZOOM_STEPS.indexOf(1); apply(); },
    };
}
