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
 * labels lived inside the scaled content - but they are still the scarcest
 * resource on a phone, so they scale with the space actually available instead
 * of being fixed.
 *
 * Fixed gutters got this exactly backwards. The column labels are rotated, so
 * their text runs along the TOP gutter's depth; at a flat 40px they had 28px of
 * run for words like "Flammkuchen", while the row labels had 43px. The top is
 * where the room is needed most, and in portrait - where width, not height, is
 * the binding constraint - it is also the cheapest room in the layout.
 */
/*
 * Caps, not sizes. The gutters are measured from the labels that actually have
 * to fit; these only stop a pathological label from eating the grid, and stop a
 * short one from leaving the headers cramped.
 */
const GUTTER = {
    left: { min: 62, share: 0.32 },
    top: { min: 52, share: 0.34 },
};

/**
 * Gutters sized from the labels they have to hold.
 *
 * Fixed ratios sized the two gutters independently of their contents, so the
 * row labels and the rotated column labels ended up at different sizes - the
 * top noticeably smaller, because its ratio happened to give it less room for
 * longer words. Measuring what each side must actually fit lets both use the
 * same type size, which is what makes the header read as one thing.
 */
export function computeGutters(ctx, layout, puzzle, cssWidth, cssHeight) {
    /*
     * Bemessen am Ziel, nicht am Maximum.
     *
     * Bei LABEL_MAX_PX gemessen wachsen die Gutter so weit, dass ein
     * 5x5-Raetsel bei 375x812 gemessen auf exakt 12.5px Zellgroesse faellt -
     * die Schwelle, ab der ein Tipp keiner Zelle mehr eindeutig zuzuordnen
     * ist. Auf der Grenze zu sitzen heisst, dass die naechste Aenderung sie
     * reisst. LABEL_TARGET_PX laesst Luft und ist immer noch deutlich mehr,
     * als die Beschriftungen vorher bekamen.
     */
    ctx.font = `400 ${LABEL_TARGET_PX}px system-ui, sans-serif`;
    const widest = texts => texts.reduce((max, text) => Math.max(max, ctx.measureText(text).width), 0);

    /*
     * Der linke Gutter misst sich an BEIDEN Beschriftungssaetzen.
     *
     * Vorher nur an den Zeilenbeschriftungen. Da beide Seiten sich eine
     * Schriftgroesse teilen (drawHeaders, "ONE size for both sides"), und
     * fontToFit den schmaleren der beiden Raeume als Grenze nimmt, hielt der
     * linke Gutter die Spaltenbeschriftungen klein - obwohl oben Platz war.
     *
     * Gemessen bei 320x568: links 71px, bemessen an "17:00 Uhr" (48px);
     * oben 83px, bemessen an "Flammkuchen" (69px). Die gemeinsame Grenze war
     * damit 50px, und "Flammkuchen" musste von 11px auf 8px schrumpfen - die
     * Untergrenze - obwohl es oben 71px Lauf gehabt haette.
     *
     * Wer eine Groesse teilt, muss auch den Platz danach bemessen.
     */
    const widestLabel = Math.max(
        widest(rowLabels(layout, puzzle)),
        widest(columnLabels(layout, puzzle)),
    );
    const left = Math.min(
        Math.max(GUTTER.left.min, widestLabel + CATEGORY_STRIP + 10),
        Math.max(GUTTER.left.min, cssWidth * GUTTER.left.share),
    );
    const top = Math.min(
        Math.max(GUTTER.top.min, widest(columnLabels(layout, puzzle)) + 14),
        Math.max(GUTTER.top.min, cssHeight * GUTTER.top.share),
    );
    return { left: Math.round(left), top: Math.round(top) };
}

const rowLabels = (layout, puzzle) =>
    layout.rows.flatMap(index => puzzle.categories[index].values);
const columnLabels = (layout, puzzle) =>
    layout.columns.flatMap(index => puzzle.categories[index].values);

/** Far-left strip holding the rotated category name, clear of the values. */
const CATEGORY_STRIP = 13;

/**
 * Truncates to fit instead of squeezing.
 *
 * Canvas's fillText(text, x, y, maxWidth) does NOT clip - it condenses the
 * glyphs horizontally until they fit, which is what made the column headers look
 * crushed. An ellipsis costs a character and keeps the letterforms honest.
 */
function fitText(ctx, text, maxWidth) {
    if (maxWidth <= 0) return '';
    if (ctx.measureText(text).width <= maxWidth) return text;
    let cut = text.length;
    while (cut > 1 && ctx.measureText(`${text.slice(0, cut)}…`).width > maxWidth) cut--;
    return `${text.slice(0, cut)}…`;
}

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
const LABEL_MAX_PX = 11;
const LABEL_MIN_PX = 8;
/*
 * Die Groesse, auf die die Gutter bemessen werden.
 *
 * Nicht LABEL_MAX_PX: die letzten zwei Pixel Schrift kosten so viel
 * Gutterbreite, dass ein 5x5-Raetsel auf die Tippschwelle faellt. Gemessen
 * bei 320x568 kostet dieser Wert dort gar nichts, weil die Einpassung an der
 * Hoehe haengt, nicht an der Breite.
 */
const LABEL_TARGET_PX = 10;

function labelFontPx(cellPx) {
    return Math.max(LABEL_MIN_PX, Math.min(LABEL_MAX_PX, Math.floor(cellPx - 2)));
}

/**
 * Largest size at or below `startPx` at which every one of `texts` fits.
 *
 * The row pitch is not the only constraint: a rotated column label runs along
 * the gutter's DEPTH, and in landscape that is far tighter than the pitch. Sized
 * by pitch alone, every long word arrived truncated. Shrinking is the better
 * trade - a smaller word still reads, half a word does not.
 */
function fontToFit(ctx, texts, maxWidth, startPx) {
    let size = startPx;
    while (size > LABEL_MIN_PX) {
        ctx.font = `400 ${size}px system-ui, sans-serif`;
        if (texts.every(text => ctx.measureText(text).width <= maxWidth)) break;
        size -= 1;
    }
    return size;
}

/**
 * Canvas colours, read from the same CSS custom properties everything else uses.
 *
 * Hard-coding them left a white grid sitting on a dark page in dark mode. The
 * canvas cannot inherit CSS, so it reads the tokens once per measure instead.
 */
const COLOR_TOKENS = {
    gutter: '--grid-gutter',
    rule: '--grid-rule',
    blockRule: '--grid-block-rule',
    surface: '--grid-cell',
    cellLine: '--grid-cell-line',
    yes: '--grid-yes',
    yesFill: '--grid-yes-fill',
    no: '--grid-no',
    maybe: '--grid-maybe',
    conflict: '--grid-conflict',
    conflictFill: '--grid-conflict-fill',
    noFill: '--grid-no-fill',
    wrong: '--grid-wrong',
    wrongFill: '--grid-wrong-fill',
    text: '--grid-label',
    accent: '--grid-label-active',
    teal: '--grid-category',
    crosshair: '--grid-crosshair',
};

const FALLBACK = {
    gutter: '#FBFAF7', rule: '#D9D4CA', blockRule: '#8A8378', surface: '#FFFFFF',
    cellLine: '#E2DED6', yes: '#1B7A4B', yesFill: '#E3F1EA', no: '#8A8378',
    noFill: '#F2F1EE', maybe: '#9AA0AB', conflict: '#B8860B', conflictFill: '#FDF3D6', wrong: '#C0392B', wrongFill: '#FBE9E7', text: '#172033',
    accent: '#C6492D', teal: '#227C78', crosshair: 'rgba(34,124,120,.13)',
};

export function readPalette(element) {
    const style = getComputedStyle(element);
    const palette = {};
    for (const [name, token] of Object.entries(COLOR_TOKENS)) {
        palette[name] = style.getPropertyValue(token).trim() || FALLBACK[name];
    }
    return palette;
}

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

function drawCells(ctx, { layout, view, marks, wrong, conflicts, cssWidth, cssHeight, dpr, gutters, colors }) {
    const size = CELL * view.scale;
    const glyphs = size >= GLYPH_MIN_CELL_PX;
    ctx.lineWidth = Math.max(0.5, Math.min(1, size / 34));
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const cell of layout.cells) {
        const point = worldToScreen(view, cell.x, cell.y);
        if (point.x > cssWidth || point.y > cssHeight) continue;
        if (point.x + size < gutters.left || point.y + size < gutters.top) continue;

        const mark = marks.get(cell.key);
        const isWrong = wrong.has(cell.key);
        // `wrong` wins where both apply: red says "this contradicts the
        // solution", which is the stronger statement than "these contradict
        // each other".
        const isConflict = !isWrong && conflicts.has(cell.key);

        ctx.fillStyle = isWrong ? colors.wrongFill
            : isConflict ? colors.conflictFill
            : mark === 'yes' ? colors.yesFill
            : mark === 'no' ? colors.noFill
            : colors.surface;
        ctx.fillRect(point.x, point.y, size, size);
        ctx.strokeStyle = colors.cellLine;
        ctx.strokeRect(hairline(point.x, dpr), hairline(point.y, dpr), size - 1, size - 1);

        if (!mark) continue;
        ctx.fillStyle = isWrong ? colors.wrong
            : isConflict ? colors.conflict
            : mark === 'yes' ? colors.yes
            : mark === 'maybe' ? colors.maybe
            : colors.no;
        if (mark === 'maybe') {
            // A small dot, deliberately quieter than a settled cross: this is the
            // player's own uncertainty, not a decision.
            ctx.beginPath();
            ctx.arc(point.x + size / 2, point.y + size / 2, Math.max(1, size * 0.12), 0, Math.PI * 2);
            ctx.fill();
        } else if (glyphs) {
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

function drawBlockRules(ctx, { layout, view, dpr, colors }) {
    const size = layout.valueCount * CELL * view.scale;
    ctx.strokeStyle = colors.blockRule;
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

/**
 * The active row and column, tinted across the grid.
 *
 * Bounded by where the puzzle actually is, not by the viewport: the matrix is
 * triangular, so filling to the far edge drew a long stripe out across empty
 * space and made the highlight look like a rendering fault rather than a cue.
 */
function drawCrosshair(ctx, { layout, view, selected, gutters, colors }) {
    if (!selected) return;
    const size = CELL * view.scale;
    const point = worldToScreen(view, selected.x, selected.y);
    const origin = worldToScreen(view, 0, 0);
    const rowRight = worldToScreen(view, layout.rowEnd[selected.rowBlock], 0).x;
    const colBottom = worldToScreen(view, 0, layout.colEnd[selected.colBlock]).y;

    ctx.save();
    // Never paint into the label gutters.
    ctx.beginPath();
    ctx.rect(gutters.left, gutters.top, ctx.canvas.width, ctx.canvas.height);
    ctx.clip();

    ctx.fillStyle = colors.crosshair;
    ctx.fillRect(origin.x, point.y, rowRight - origin.x, size);
    ctx.fillRect(point.x, origin.y, size, colBottom - origin.y);

    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(point.x - 1, point.y - 1, size + 2, size + 2);
    ctx.restore();
}

function drawHeaders(ctx, { layout, view, puzzle, selected, cssWidth, cssHeight, dpr, gutters, colors }) {
    const size = CELL * view.scale;
    // ONE size for both sides. Sizing them separately is what made the column
    // headers visibly smaller than the row headers.
    const labelPx = fontToFit(
        ctx,
        [...rowLabels(layout, puzzle), ...columnLabels(layout, puzzle)],
        Math.min(gutters.left - CATEGORY_STRIP - 8, gutters.top - 12),
        labelFontPx(size),
    );

    /*
     * Die gewaehlte Groesse veroeffentlichen, wie die Gutter auch.
     *
     * Ein Test kann sie sonst nur annehmen, und eine Annahme war hier schon
     * falsch: der Waechter mass mit fest 8px, waehrend gezeichnet wurde, was
     * in den Gutter passte. Die Groesse haengt vom Fenster ab - im Querformat
     * ist der obere Gutter flacher, also schrumpft sie dort weiter.
     */
    ctx.canvas.style.setProperty('--overview-label-px', `${labelPx}px`);

    ctx.fillStyle = colors.gutter;
    ctx.fillRect(0, 0, gutters.left, cssHeight);
    ctx.fillRect(0, 0, cssWidth, gutters.top);
    ctx.strokeStyle = colors.rule;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const ruleX = hairline(gutters.left, dpr);
    const ruleY = hairline(gutters.top, dpr);
    ctx.moveTo(ruleX, 0); ctx.lineTo(ruleX, cssHeight);
    ctx.moveTo(0, ruleY); ctx.lineTo(cssWidth, ruleY);
    ctx.stroke();

    // --- Row labels -------------------------------------------------------
    ctx.save();
    ctx.beginPath(); ctx.rect(0, gutters.top, gutters.left, cssHeight - gutters.top); ctx.clip();
    ctx.textBaseline = 'middle';
    layout.rows.forEach((categoryIndex, rowBlock) => {
        const category = puzzle.categories[categoryIndex];
        for (let value = 0; value < layout.valueCount; value++) {
            const cell = layout.cells.find(c => c.rowBlock === rowBlock && c.rowValue === value);
            if (!cell) continue;
            const y = worldToScreen(view, 0, cell.y).y + size / 2;
            if (y < gutters.top - 10 || y > cssHeight + 10) continue;
            const active = selected?.rowBlock === rowBlock && selected?.rowValue === value;
            ctx.textAlign = 'right';
            ctx.fillStyle = active ? colors.accent : colors.text;
            ctx.font = `${active ? 700 : 400} ${labelPx}px system-ui, sans-serif`;
            // Values keep clear of the category strip on the far left, which is
            // what stopped the two colliding on a narrow gutter.
            ctx.fillText(
                fitText(ctx, category.values[value], gutters.left - CATEGORY_STRIP - 8),
                gutters.left - 5, y,
            );
        }

        // Category name, rotated into its own strip and centred on the block.
        const blockCells = layout.cells.filter(c => c.rowBlock === rowBlock);
        if (!blockCells.length) return;
        const top = worldToScreen(view, 0, blockCells[0].y).y;
        const bottom = top + layout.valueCount * size;
        if (bottom < gutters.top || top > cssHeight) return;
        /*
         * Mittig im SICHTBAREN Teil des eigenen Blocks, nicht am Bildrand.
         *
         * Vorher wurde der Mittelpunkt an den Rand geklemmt. Laeuft ein Block
         * halb aus dem Bild, zog das seine Ueberschrift nach innen - auf die
         * des Nachbarn. Auf einem 320px-Schirm verschmolzen "STAND" und
         * "ANKUNFT" so zu "STANDANKUNFT". Bleibt die Ueberschrift im
         * sichtbaren Ausschnitt ihres eigenen Blocks, kann das nicht
         * passieren, und sie steht immer ueber dem, was sie benennt.
         */
        const sichtbarOben = Math.max(top, gutters.top);
        const sichtbarUnten = Math.min(bottom, cssHeight);
        const centre = (sichtbarOben + sichtbarUnten) / 2;
        ctx.save();
        ctx.translate(CATEGORY_STRIP - 4, centre);
        ctx.rotate(-Math.PI / 2);
        ctx.textAlign = 'center';
        ctx.fillStyle = colors.teal;
        ctx.font = `700 ${CATEGORY_FONT_PX}px system-ui, sans-serif`;
        ctx.fillText(
            fitText(ctx, category.label.toUpperCase(), sichtbarUnten - sichtbarOben),
            0, 0,
        );
        ctx.restore();
    });
    ctx.restore();

    // --- Column labels ----------------------------------------------------
    // Rotated with the canvas transform rather than writing-mode: the CSS route
    // needed vertical-rl plus a rotate plus sticky, and those three do not
    // survive each other in Safari.
    ctx.save();
    ctx.beginPath(); ctx.rect(gutters.left, 0, cssWidth - gutters.left, gutters.top); ctx.clip();
    ctx.textBaseline = 'middle';
    layout.columns.forEach((categoryIndex, colBlock) => {
        const category = puzzle.categories[categoryIndex];
        for (let value = 0; value < layout.valueCount; value++) {
            const cell = layout.cells.find(c => c.colBlock === colBlock && c.colValue === value);
            if (!cell) continue;
            const x = worldToScreen(view, cell.x, 0).x + size / 2;
            if (x < gutters.left - 10 || x > cssWidth + 10) continue;
            const active = selected?.colBlock === colBlock && selected?.colValue === value;
            ctx.save();
            ctx.translate(x, gutters.top - 4);
            ctx.rotate(-Math.PI / 2);
            ctx.textAlign = 'left';
            ctx.fillStyle = active ? colors.accent : colors.text;
            ctx.font = `${active ? 700 : 400} ${labelPx}px system-ui, sans-serif`;
            ctx.fillText(fitText(ctx, category.values[value], gutters.top - 12), 0, 0);
            ctx.restore();
        }
        const blockCells = layout.cells.filter(c => c.colBlock === colBlock);
        if (!blockCells.length) return;
        const left = worldToScreen(view, blockCells[0].x, 0).x;
        const right = left + layout.valueCount * size;
        if (right < gutters.left || left > cssWidth) return;
        // Dieselbe Regel wie links: im sichtbaren Teil des eigenen Blocks.
        const sichtbarLinks = Math.max(left, gutters.left);
        const sichtbarRechts = Math.min(right, cssWidth);
        const centre = (sichtbarLinks + sichtbarRechts) / 2;
        ctx.textAlign = 'center';
        ctx.fillStyle = colors.teal;
        ctx.font = `700 ${CATEGORY_FONT_PX}px system-ui, sans-serif`;
        ctx.fillText(
            fitText(ctx, category.label.toUpperCase(), sichtbarRechts - sichtbarLinks),
            centre, 6,
        );
    });
    ctx.restore();
}

/** The whole world plus the current viewport rectangle, for the empty corner. */
export function renderMinimap(ctx, { layout, view, marks, width, height, cssWidth, cssHeight, gutters, colors }) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const scale = Math.min((width - 8) / layout.width, (height - 8) / layout.height);
    const offsetX = (width - layout.width * scale) / 2;
    const offsetY = (height - layout.height * scale) / 2;

    ctx.fillStyle = colors.noFill;
    for (const cell of layout.cells) {
        ctx.fillRect(offsetX + cell.x * scale, offsetY + cell.y * scale, CELL * scale, CELL * scale);
    }
    for (const cell of layout.cells) {
        const mark = marks.get(cell.key);
        if (!mark) continue;
        ctx.fillStyle = mark === 'yes' ? colors.yes : colors.no;
        ctx.fillRect(offsetX + cell.x * scale, offsetY + cell.y * scale, CELL * scale, CELL * scale);
    }

    // Zoomed out, the visible region is larger than the world, so the rectangle
    // would spill past the minimap's own edges and read as a stray stroke across
    // the grid behind it. Clip it to the minimap.
    const topLeft = { x: (gutters.left - view.tx) / view.scale, y: (gutters.top - view.ty) / view.scale };
    const bottomRight = { x: (cssWidth - view.tx) / view.scale, y: (cssHeight - view.ty) / view.scale };
    ctx.save();
    ctx.beginPath();
    ctx.rect(1, 1, width - 2, height - 2);
    ctx.clip();
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(
        offsetX + topLeft.x * scale, offsetY + topLeft.y * scale,
        (bottomRight.x - topLeft.x) * scale, (bottomRight.y - topLeft.y) * scale,
    );
    ctx.restore();
}
