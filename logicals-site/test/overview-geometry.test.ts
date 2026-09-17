import { describe, expect, it } from 'vitest';
import {
  CELL, BLOCK_GAP, MIN_CELL_PX, gridAxes, blockVisible, createLayout, hitTest,
} from '../client/js/play/overview/geometry';

const cellKey = (rc: number, rv: number, cc: number, cv: number) => `${rc}.${cc}.${rv}.${cv}`;

function puzzleOf(categoryCount: number, valueCount: number) {
  return {
    categories: Array.from({ length: categoryCount }, (_, c) => ({
      label: `K${c}`,
      values: Array.from({ length: valueCount }, (_, v) => `v${c}${v}`),
    })),
  };
}

describe('overview geometry', () => {
  it('derives the same axes as the table overview did', () => {
    expect(gridAxes(5)).toEqual({ columns: [1, 2, 3, 4], rows: [0, 4, 3, 2] });
    expect(gridAxes(3)).toEqual({ columns: [1, 2], rows: [0, 2] });
  });

  it('keeps only the triangular half of the block matrix', () => {
    expect(blockVisible(0, 3, 4)).toBe(true);
    expect(blockVisible(1, 3, 4)).toBe(false);
    expect(blockVisible(3, 0, 4)).toBe(true);
    expect(blockVisible(3, 1, 4)).toBe(false);
  });

  it('builds exactly the 250 cells of a worst-case 5x5 puzzle', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    expect(layout.cells).toHaveLength(250);
    expect(new Set(layout.cells.map(c => c.key)).size).toBe(250);
    expect(layout.width).toBe(4 * (5 * CELL + BLOCK_GAP) - BLOCK_GAP);
    expect(layout.height).toBe(4 * (5 * CELL + BLOCK_GAP) - BLOCK_GAP);
  });

  it('builds the smallest supported puzzle too', () => {
    const layout = createLayout(puzzleOf(3, 4), cellKey);
    expect(layout.cells).toHaveLength(3 * 4 * 4);
    expect(layout.valueCount).toBe(4);
  });

  it('places blocks on a gapped lattice', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    const first = layout.cells.find(c => c.rowBlock === 0 && c.colBlock === 0 && c.rowValue === 0 && c.colValue === 0)!;
    const second = layout.cells.find(c => c.rowBlock === 0 && c.colBlock === 1 && c.rowValue === 0 && c.colValue === 0)!;
    expect(first.x).toBe(0);
    expect(second.x).toBe(5 * CELL + BLOCK_GAP);
  });

  it('hits the cell under the point at every cell centre', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    for (const cell of layout.cells) {
      const hit = hitTest(layout, cell.x + CELL / 2, cell.y + CELL / 2, 1, 22);
      expect(hit?.key).toBe(cell.key);
    }
  });

  it('still hits the right cell through a +/-6px finger error at the 12.5px floor', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    const scale = MIN_CELL_PX / CELL;
    const offsets = [[0, 0], [6, 0], [-6, 0], [0, 6], [0, -6], [4, 4], [-4, -4]];
    for (const cell of layout.cells) {
      for (const [dx, dy] of offsets) {
        const hit = hitTest(layout, cell.x + CELL / 2 + dx / scale, cell.y + CELL / 2 + dy / scale, scale, 22);
        expect(hit?.key).toBe(cell.key);
      }
    }
  });

  it('returns null well outside the grid', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    expect(hitTest(layout, -500, -500, 1, 22)).toBeNull();
  });

  it('returns null inside the empty triangular corner', () => {
    const layout = createLayout(puzzleOf(5, 5), cellKey);
    // Bottom-right block slot (rowBlock 3, colBlock 3) is structurally empty.
    const x = 3 * (5 * CELL + BLOCK_GAP) + 2 * CELL;
    const y = 3 * (5 * CELL + BLOCK_GAP) + 2 * CELL;
    expect(hitTest(layout, x, y, 1, 0)).toBeNull();
  });
});
