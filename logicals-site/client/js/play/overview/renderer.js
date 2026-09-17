/**
 * All canvas painting for the overview.
 *
 * The important decision here: headers are drawn in SCREEN space at a constant
 * font size, into fixed gutters. In the old table they lived inside the scaled
 * content, so they cost world width and shrank with the zoom - at fit scale the
 * labels rendered at 3.4px. Here the zoom cannot touch them.
 */

import { CELL, blockVisible } from './geometry.js';
import { worldToScreen } from './viewport.js';

/*
 * Screen-space gutters reserved for the always-legible labels.
 *
 * These are charged against the viewport ONCE, unlike the old table where the
 * labels lived inside the scaled content. They are still the scarcest resource
 * on a 375px phone: every pixel here is a pixel the grid cannot use, and at 78px
 * the left gutter alone was costing enough width to push the fit below the tap
 * floor. 64 is the smallest that still holds a German value label.
 */
export const GUTTER_LEFT = 64;
export const GUTTER_TOP = 40;

/** Far-left strip holding the rotated category name, clear of the values. */
const CATEGORY_STRIP = 13;

const CATEGORY_FONT_PX = 8;
/** Below this a glyph is noise, so the mark is drawn as a dot instead. */
const GLYPH_MIN_CELL_PX = 11;

/**
 * Labels shrink with the row pitch instead of being dropped.
 *
 * Decimating them - showing only the first value of each block - left the grid
 * unreadable exactly when the player most needs the labels. 8px is small but
 * legible, and the readout under the grid always spells the selected cell out
 * in full anyway.
 */
function labelFontPx(cellPx) {
    return Math.max(8, Math.min(11, Math.floor(cellPx - 2)));
}

const COLORS = {
    gutter: '#FBFAF7',
    rule: '#D9D4CA',
    blockRule: '#8A8378',
    cellLine: '#E2DED6',
    surface: '#FFFFFF',
    yesFill: '#E3F1EA',
    noFill: '#F2F1EE',
    yes: '#1B7A4B',
    no: '#8A8378',
    wrongFill: '#FBE9E7',
    wrong: '#C0392B',
    text: '#172033',
    accent: '#C6492D',
    teal: '#227C78',
    crosshair: 'rgba(34,124,120,.13)',
};

/** Sizes the backing store for the device pixel ratio so text stays crisp. */
export function resizeCanvas(canvas, cssWidth, cssHeight) {
    // Capped at 3: past that the backing store grows faster than the gain. iOS
    // also has a hard ceiling - 8192px per dimension, 8192*8192 area since
    // iOS 18 - and exceeding it fails SILENTLY, leaving a blank canvas. A
    // viewport-sized canvas is nowhere near it; a whole-grid-at-once canvas
    // would be, which is another reason to redraw the visible region per frame.
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    canvas.width = Math.max(1, Math.round(cssWidth * dpr));
    canvas.height = Math.max(1, Math.round(cssHeight * dpr));
    return { dpr };
}

/**
 * Snaps a coordinate so a 1-unit line lands on whole device pixels.
 *
 * The naive "+0.5" is wrong once the context is scaled by the device pixel
 * ratio: half a CSS pixel is 1.5 device pixels at DPR 3, which blurs every
 * hairline. Snap in device space, and offset by half only when the rounded
 * device-pixel width is odd.
 */
function hairline(value, dpr) {
    const width = Math.max(1, Math.round(dpr));
    const offset = width % 2 ? 0.5 / dpr : 0;
    return Math.round(value * dpr) / dpr + offset;
}

export function render(ctx, options) {
    const { cssWidth, cssHeight, dpr } = options;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    drawCells(ctx, options);
    drawBlockRules(ctx, options);
    drawCrosshair(ctx, options);
    drawHeaders(ctx, options);
}

function drawCells(ctx, { layout, view, marks, wrong, cssWidth, cssHeight, dpr }) {
    const size = CELL * view.scale;
    const glyphs = size >= GLYPH_MIN_CELL_PX;
    ctx.lineWidth = Math.max(0.5, Math.min(1, size / 34));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const cell of layout.cells) {
        const point = worldToScreen(view, cell.x, cell.y);
        if (point.x > cssWidth || point.y > cssHeight) continue;
        if (point.x + size < GUTTER_LEFT || point.y + size < GUTTER_TOP) continue;

        const mark = marks.get(cell.key);
        const isWrong = wrong.has(cell.key);

        ctx.fillStyle = isWrong ? COLORS.wrongFill
            : mark === 'yes' ? COLORS.yesFill
            : mark === 'no' ? COLORS.noFill
            : COLORS.surface;
        ctx.fillRect(point.x, point.y, size, size);
        ctx.strokeStyle = COLORS.cellLine;
        ctx.strokeRect(hairline(point.x, dpr), hairline(point.y, dpr), size - 1, size - 1);

        if (!mark) continue;
        ctx.fillStyle = isWrong ? COLORS.wrong : mark === 'yes' ? COLORS.yes : COLORS.no;
        if (glyphs) {
            ctx.font = `${mark === 'yes' ? 700 : 400} ${Math.round(size * 0.62)}px system-ui, sans-serif`;
            ctx.fillText(mark === 'yes' ? '○' : '×', point.x + size / 2, point.y + size / 2 + size * 0.02);
        } else {
            const radius = Math.max(1, size * 0.22);
            ctx.beginPath();
            ctx.arc(point.x + size / 2, point.y + size / 2, radius, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawBlockRules(ctx, { layout, view, dpr }) {
    const size = layout.valueCount * CELL * view.scale;
    ctx.strokeStyle = COLORS.blockRule;
    ctx.lineWidth = Math.max(1, Math.min(2, view.scale * 1.6));
    layout.rows.forEach((_, rowBlock) => {
        layout.columns.forEach((__, colBlock) => {
            if (!blockVisible(rowBlock, colBlock, layout.columns.length)) return;
            const origin = layout.cells.find(cell =>
                cell.rowBlock === rowBlock && cell.colBlock === colBlock
                && cell.rowValue === 0 && cell.colValue === 0);
            if (!origin) return;
            const point = worldToScreen(view, origin.x, origin.y);
            ctx.strokeRect(hairline(point.x, dpr), hairline(point.y, dpr), size, size);
        });
    });
}

/** The active row and column, tinted across the whole grid. */
function drawCrosshair(ctx, { view, selected, cssWidth, cssHeight }) {
    if (!selected) return;
    const size = CELL * view.scale;
    const point = worldToScreen(view, selected.x, selected.y);
    ctx.fillStyle = COLORS.crosshair;
    ctx.fillRect(GUTTER_LEFT, point.y, cssWidth - GUTTER_LEFT, size);
    ctx.fillRect(point.x, GUTTER_TOP, size, cssHeight - GUTTER_TOP);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(point.x - 1, point.y - 1, size + 2, size + 2);
}

function drawHeaders(ctx, { layout, view, puzzle, selected, cssWidth, cssHeight, dpr }) {
    const size = CELL * view.scale;
    const labelPx = labelFontPx(size);

    ctx.fillStyle = COLORS.gutter;
    ctx.fillRect(0, 0, GUTTER_LEFT, cssHeight);
    ctx.fillRect(0, 0, cssWidth, GUTTER_TOP);
    ctx.strokeStyle = COLORS.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ruleX = hairline(GUTTER_LEFT, dpr);
    const ruleY = hairline(GUTTER_TOP, dpr);
    ctx.moveTo(ruleX, 0); ctx.lineTo(ruleX, cssHeight);
    ctx.moveTo(0, ruleY); ctx.lineTo(cssWidth, ruleY);
    ctx.stroke();

    // --- Row labels -------------------------------------------------------
    ctx.save();
    ctx.beginPath(); ctx.rect(0, GUTTER_TOP, GUTTER_LEFT, cssHeight - GUTTER_TOP); ctx.clip();
    ctx.textBaseline = 'middle';
    layout.rows.forEach((categoryIndex, rowBlock) => {
        const category = puzzle.categories[categoryIndex];
        for (let value = 0; value < layout.valueCount; value++) {
            const cell = layout.cells.find(c => c.rowBlock === rowBlock && c.rowValue === value);
            if (!cell) continue;
            const y = worldToScreen(view, 0, cell.y).y + size / 2;
            if (y < GUTTER_TOP - 10 || y > cssHeight + 10) continue;
            const active = selected?.rowBlock === rowBlock && selected?.rowValue === value;
            ctx.textAlign = 'right';
            ctx.fillStyle = active ? COLORS.accent : COLORS.text;
            ctx.font = `${active ? 700 : 400} ${labelPx}px system-ui, sans-serif`;
            // Values keep clear of the category strip on the far left, which is
            // what stopped the two colliding on a narrow gutter.
            ctx.fillText(category.values[value], GUTTER_LEFT - 5, y,
                GUTTER_LEFT - CATEGORY_STRIP - 8);
        }

        // Category name, rotated into its own strip and centred on the block.
        const blockCells = layout.cells.filter(c => c.rowBlock === rowBlock);
        if (!blockCells.length) return;
        const top = worldToScreen(view, 0, blockCells[0].y).y;
        const bottom = top + layout.valueCount * size;
        if (bottom < GUTTER_TOP || top > cssHeight) return;
        const centre = Math.min(Math.max((top + bottom) / 2, GUTTER_TOP + 20), cssHeight - 20);
        ctx.save();
        ctx.translate(CATEGORY_STRIP - 4, centre);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.teal;
        ctx.font = `700 ${CATEGORY_FONT_PX}px system-ui, sans-serif`;
        ctx.fillText(category.label.toUpperCase(), 0, 0, layout.valueCount * size);
        ctx.restore();
    });
    ctx.restore();

    // --- Column labels ----------------------------------------------------
    // Rotated with the canvas transform rather than writing-mode: the CSS route
    // needed vertical-rl plus a rotate plus sticky, and those three do not
    // survive each other in Safari.
    ctx.save();
    ctx.beginPath(); ctx.rect(GUTTER_LEFT, 0, cssWidth - GUTTER_LEFT, GUTTER_TOP); ctx.clip();
    ctx.textBaseline = 'middle';
    layout.columns.forEach((categoryIndex, colBlock) => {
        const category = puzzle.categories[categoryIndex];
        for (let value = 0; value < layout.valueCount; value++) {
            const cell = layout.cells.find(c => c.colBlock === colBlock && c.colValue === value);
            if (!cell) continue;
            const x = worldToScreen(view, cell.x, 0).x + size / 2;
            if (x < GUTTER_LEFT - 10 || x > cssWidth + 10) continue;
            const active = selected?.colBlock === colBlock && selected?.colValue === value;
            ctx.save();
            ctx.translate(x, GUTTER_TOP - 4);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'left';
            ctx.fillStyle = active ? COLORS.accent : COLORS.text;
            ctx.font = `${active ? 700 : 400} ${labelPx}px system-ui, sans-serif`;
            ctx.fillText(category.values[value], 0, 0, GUTTER_TOP - 12);
            ctx.restore();
        }
        const blockCells = layout.cells.filter(c => c.colBlock === colBlock);
        if (!blockCells.length) return;
        const left = worldToScreen(view, blockCells[0].x, 0).x;
        const right = left + layout.valueCount * size;
        if (right < GUTTER_LEFT || left > cssWidth) return;
        const centre = Math.min(Math.max((left + right) / 2, GUTTER_LEFT + 24), cssWidth - 24);
        ctx.textAlign = 'center';
        ctx.fillStyle = COLORS.teal;
        ctx.font = `700 ${CATEGORY_FONT_PX}px system-ui, sans-serif`;
        ctx.fillText(category.label.toUpperCase(), centre, 6, layout.valueCount * size);
    });
    ctx.restore();
}

/** The whole world plus the current viewport rectangle, for the empty corner. */
export function renderMinimap(ctx, { layout, view, marks, width, height, cssWidth, cssHeight }) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min((width - 8) / layout.width, (height - 8) / layout.height);
    const offsetX = (width - layout.width * scale) / 2;
    const offsetY = (height - layout.height * scale) / 2;

    ctx.fillStyle = '#ECE9E2';
    for (const cell of layout.cells) {
        ctx.fillRect(offsetX + cell.x * scale, offsetY + cell.y * scale, CELL * scale, CELL * scale);
    }
    for (const cell of layout.cells) {
        const mark = marks.get(cell.key);
        if (!mark) continue;
        ctx.fillStyle = mark === 'yes' ? COLORS.yes : '#B5AFA4';
        ctx.fillRect(offsetX + cell.x * scale, offsetY + cell.y * scale, CELL * scale, CELL * scale);
    }

    const topLeft = { x: (GUTTER_LEFT - view.tx) / view.scale, y: (GUTTER_TOP - view.ty) / view.scale };
    const bottomRight = { x: (cssWidth - view.tx) / view.scale, y: (cssHeight - view.ty) / view.scale };
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(
        offsetX + topLeft.x * scale, offsetY + topLeft.y * scale,
        (bottomRight.x - topLeft.x) * scale, (bottomRight.y - topLeft.y) * scale,
    );
}
