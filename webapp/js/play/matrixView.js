/**
 * One category-pair matrix - the phone-portrait view.
 *
 * A 5x5 puzzle is ten of these blocks. Showing one at a time is what lets every
 * cell reach Apple's 44pt minimum on a 390px screen; the full grid needs 776px
 * and cannot.
 */

import { make, clear } from '../dom.js';
import { bindTapTarget } from './tapTarget.js';

/** Every unordered category pair, in a stable reading order. */
export function categoryPairs(categoryCount) {
    const pairs = [];
    for (let a = 0; a < categoryCount; a++) {
        for (let b = a + 1; b < categoryCount; b++) pairs.push([a, b]);
    }
    return pairs;
}

/**
 * Builds one matrix table.
 * @returns {{ node: HTMLElement, cells: Map<string, HTMLButtonElement> }}
 */
export function buildMatrix(puzzle, rowCategoryIndex, colCategoryIndex, { cellKey, onActivate }) {
    const rowCategory = puzzle.categories[rowCategoryIndex];
    const colCategory = puzzle.categories[colCategoryIndex];
    const cells = new Map();

    const table = make('table', { className: 'matrix' });
    table.lang = 'de';

    const thead = make('thead');
    const headRow = make('tr');
    headRow.append(make('td', { className: 'm-corner' }));
    for (const value of colCategory.values) {
        headRow.append(make('th', { className: 'm-colhead', text: value, attrs: { scope: 'col' } }));
    }
    thead.append(headRow);

    const tbody = make('tbody');
    rowCategory.values.forEach((rowValue, rowValueIndex) => {
        const tr = make('tr');
        tr.append(make('th', { className: 'm-rowhead', text: rowValue, attrs: { scope: 'row' } }));

        colCategory.values.forEach((colValue, colValueIndex) => {
            const td = make('td');
            const key = cellKey(rowCategoryIndex, rowValueIndex, colCategoryIndex, colValueIndex);
            const button = make('button', { className: 'cell', attrs: { type: 'button' } });
            button.dataset.label = `${rowValue} / ${colValue}`;
            button.dataset.key = key;
            bindTapTarget(button, () => onActivate(key));
            cells.set(key, button);
            td.append(button);
            tr.append(td);
        });
        tbody.append(tr);
    });

    table.append(thead, tbody);
    return { node: table, cells };
}

/**
 * Renders every pair page into the snap track and the matching segmented control.
 * @returns {{ cells: Map<string, HTMLButtonElement[]>, pages: HTMLElement[] }}
 */
export function buildPager(puzzle, track, nav, { cellKey, onActivate, onPageChange }) {
    clear(track);
    clear(nav);

    const cells = new Map();
    const pages = [];
    const pairs = categoryPairs(puzzle.categories.length);

    pairs.forEach(([a, b], index) => {
        const page = make('section', { className: 'pair-page' });
        page.id = `pair-page-${index}`;
        page.setAttribute('role', 'tabpanel');

        const label = `${puzzle.categories[a].label} × ${puzzle.categories[b].label}`;
        page.append(make('h3', { className: 'pair-page__title', text: label }));

        const { node, cells: pageCells } = buildMatrix(puzzle, a, b, { cellKey, onActivate });
        page.append(node);
        track.append(page);
        pages.push(page);

        // The same logical cell exists in exactly one matrix, but the overview
        // holds a second button for it, so values are arrays throughout.
        for (const [key, button] of pageCells) {
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(button);
        }

        const tab = make('button', { className: 'segmented__item', text: label, attrs: { type: 'button', role: 'tab' } });
        tab.setAttribute('aria-selected', index === 0 ? 'true' : 'false');
        tab.setAttribute('aria-controls', page.id);
        tab.dataset.index = String(index);
        tab.addEventListener('click', () => {
            page.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        });
        nav.append(tab);
    });

    wirePageObserver(track, nav, pages, onPageChange);
    return { cells, pages, pairs };
}

/** Keeps the segmented control in sync with whatever page the user scrolled to. */
function wirePageObserver(track, nav, pages, onPageChange) {
    if (!('IntersectionObserver' in window)) return;

    const observer = new IntersectionObserver(entries => {
        for (const entry of entries) {
            if (!entry.isIntersecting) continue;
            const index = pages.indexOf(entry.target);
            if (index < 0) continue;
            for (const tab of nav.children) {
                tab.setAttribute('aria-selected', Number(tab.dataset.index) === index ? 'true' : 'false');
            }
            nav.children[index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
            onPageChange?.(index);
        }
    }, { root: track, threshold: 0.6 });

    for (const page of pages) observer.observe(page);
}
