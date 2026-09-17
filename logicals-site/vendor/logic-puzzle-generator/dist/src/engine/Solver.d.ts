import { Clue } from './Clue';
import { LogicGrid } from './LogicGrid';
/**
 * The logical engine responsible for applying clues to a LogicGrid and deducing consequences.
 *
 * It implements various deduction strategies including basic elimination, uniqueness checks,
 * and transitive logic logic (if A=B and B=C, then A=C).
 */
export declare class Solver {
    /**
     * Builds a stable rank map for an ordinal category's values, sorted numerically.
     * This is the single source of truth for "greater than / less than" comparisons,
     * and must be used instead of raw array indices, because the values array may be
     * passed in any order (e.g. shuffled for daily puzzle variety).
     *
     * @returns `valueToRank` – a Map<ValueLabel, number> where rank 0 = smallest value.
     * @returns `rankToValue` – an array of values ordered from smallest to largest.
     */
    private getOrdinalRankMap;
    /**
     * Applies a single clue to the grid and propagates logical deductions.
     *
     * This method runs a loop that explicitly applies the clue and then repeatedly
     * triggers the internal deduction engine until no further eliminations can be made.
     *
     * @param grid - The LogicGrid to modify.
     * @param clue - The Clue to apply.
     * @returns An object containing the modified grid and the total count of eliminations made.
     */
    applyClue(grid: LogicGrid, clue: Clue): {
        grid: LogicGrid;
        deductions: number;
        reasons: import('../types').DeductionReason[];
    };
    private applyCrossOrdinalClue;
    private applyUnaryClue;
    private applyAdjacencyClue;
    private applyBetweenClue;
    private applyBinaryClue;
    private runDeductionLoop;
    private applyOrdinalClue;
    private applySuperlativeClue;
    private applyDisjunctionClue;
    /**
     * Checks if a clue is contradicted by the current grid state.
     * A clue is contradicted if applying it produces an invalid grid state (e.g. 0 possibilities in any cell).
     */
    isClueContradicted(grid: LogicGrid, clue: Clue): boolean;
    private applyArithmeticClue;
}
