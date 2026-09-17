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

const MIN_ZOOM = 0.1;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.15;

export function clampZoom(scale) {
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.round(scale * 1000) / 1000));
}

export function fitZoom({ viewportWidth, viewportHeight, contentWidth, contentHeight }) {
    if (viewportWidth <= 0 || viewportHeight <= 0 || contentWidth <= 0 || contentHeight <= 0) return 1;
    return clampZoom(Math.min(1, viewportWidth / contentWidth, viewportHeight / contentHeight));
}

export function fitZoomForLayout({ touchLayout, ...geometry }) {
    // Fine-pointer layouts stay at their natural, comfortably clickable size.
    // The compact full-grid preview is a touch layout affordance only.
    return touchLayout ? fitZoom(geometry) : 1;
}

export function zoomedScrollPosition({
    scrollLeft, scrollTop, anchorX, anchorY, previousScale, nextScale,
}) {
    const ratio = nextScale / previousScale;
    return {
        left: Math.max(0, (scrollLeft + anchorX) * ratio - anchorX),
        top: Math.max(0, (scrollTop + anchorY) * ratio - anchorY),
    };
}

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
 * Layout-aware zoom for the mobile overview. CSS `zoom` is intentional here:
 * unlike transform: scale(), Safari includes it in scroll geometry, so sticky
 * headers, hit targets and the scrollable extent stay in agreement.
 */
export function createZoom(zoomNode, scroller, output) {
    let scale = 1;
    let fitted = true;
    let pinch = null;
    let resizeFrame = 0;

    function syncTouchLayout() {
        const touchLayout = window.matchMedia('(pointer: coarse)').matches
            || navigator.maxTouchPoints > 0
            || window.matchMedia('(max-width: 899px)').matches;
        scroller.dataset.touchLayout = String(touchLayout);
        return touchLayout;
    }

    function render(nextScale) {
        scale = clampZoom(nextScale);
        zoomNode.style.zoom = String(scale);
        if (output) output.textContent = `${Math.round(scale * 100)}%`;
        const touchLayout = syncTouchLayout();
        const interactive = !touchLayout || scale >= 1;
        scroller.dataset.interactive = String(interactive);
        zoomNode.inert = !interactive;
        const hint = scroller.parentElement?.querySelector('#overview-zoom-hint');
        if (hint) hint.hidden = interactive;
    }

    function naturalSize() {
        const previousZoom = zoomNode.style.zoom;
        zoomNode.style.zoom = '1';
        const size = { width: zoomNode.scrollWidth, height: zoomNode.scrollHeight };
        zoomNode.style.zoom = previousZoom;
        return size;
    }

    function fit() {
        // Cell geometry changes between pointer and touch layouts, so set the
        // mode before measuring the natural table dimensions.
        const touchLayout = syncTouchLayout();
        const content = naturalSize();
        const style = getComputedStyle(scroller);
        const horizontalPadding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
        const verticalPadding = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
        const nextScale = fitZoomForLayout({
            touchLayout,
            viewportWidth: scroller.clientWidth - horizontalPadding,
            viewportHeight: scroller.clientHeight - verticalPadding,
            contentWidth: content.width,
            contentHeight: content.height,
        });
        render(nextScale);
        scroller.scrollLeft = 0;
        scroller.scrollTop = 0;
        fitted = true;
    }

    function zoomAt(nextScale, anchorX = scroller.clientWidth / 2, anchorY = scroller.clientHeight / 2) {
        const clamped = clampZoom(nextScale);
        const position = zoomedScrollPosition({
            scrollLeft: scroller.scrollLeft,
            scrollTop: scroller.scrollTop,
            anchorX,
            anchorY,
            previousScale: scale,
            nextScale: clamped,
        });
        render(clamped);
        scroller.scrollLeft = position.left;
        scroller.scrollTop = position.top;
        fitted = false;
    }

    function touchDistance(touches) {
        return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
    }

    scroller.addEventListener('touchstart', event => {
        if (event.touches.length !== 2) return;
        pinch = { distance: touchDistance(event.touches) };
    }, { passive: true });

    scroller.addEventListener('touchmove', event => {
        if (!pinch || event.touches.length !== 2) return;
        event.preventDefault();
        const distance = touchDistance(event.touches);
        const rect = scroller.getBoundingClientRect();
        const anchorX = ((event.touches[0].clientX + event.touches[1].clientX) / 2) - rect.left;
        const anchorY = ((event.touches[0].clientY + event.touches[1].clientY) / 2) - rect.top;
        zoomAt(scale * (distance / pinch.distance), anchorX, anchorY);
        pinch.distance = distance;
    }, { passive: false });

    scroller.addEventListener('touchend', event => {
        if (event.touches.length < 2) pinch = null;
    }, { passive: true });

    // At fit scale a dense 5x5 grid is for orientation, not precision input.
    // One tap enlarges it to 44px cells; the following tap can safely mark.
    scroller.addEventListener('click', event => {
        if (scroller.dataset.interactive !== 'false') return;
        const rect = scroller.getBoundingClientRect();
        zoomAt(1, event.clientX - rect.left, event.clientY - rect.top);
    });

    function refitAfterViewportChange() {
        if (!fitted) return;
        cancelAnimationFrame(resizeFrame);
        resizeFrame = requestAnimationFrame(() => {
            if (scroller.offsetParent) fit();
        });
    }
    window.visualViewport?.addEventListener('resize', refitAfterViewportChange);
    window.addEventListener('orientationchange', refitAfterViewportChange);

    return {
        in() { zoomAt(scale + ZOOM_STEP); },
        out() { zoomAt(scale - ZOOM_STEP); },
        fit,
        reset: fit,
    };
}
