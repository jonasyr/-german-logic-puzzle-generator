import { CategoryConfig, ValueLabel } from '../types';
/**
 * Represents the state of the logic puzzle grid.
 *
 * It manages the possibilities between every pair of values across different categories.
 * The grid is initialized where all connections are possible (true).
 * As clues are applied, possibilities are eliminated (set to false).
 */
export declare class LogicGrid {
    private grid;
    private categories;
    private valueMap;
    /**
     * Creates a new LogicGrid instance.
     *
     * @param categories - The configuration of categories and their values for the puzzle.
     * @throws {Error} If the configuration is invalid (duplicate IDs, duplicate values, or mismatched value counts).
     */
    constructor(categories: CategoryConfig[]);
    private validateConfig;
    /**
     * Sets the possibility state between two values from different categories.
     *
     * @param cat1Id - The ID of the first category.
     * @param val1 - The value from the first category.
     * @param cat2Id - The ID of the second category.
     * @param val2 - The value from the second category.
     * @param state - true if the connection is possible, false if eliminated.
     */
    setPossibility(cat1Id: string, val1: ValueLabel, cat2Id: string, val2: ValueLabel, state: boolean): void;
    /**
     * Checks if a connection between two values is currently possible.
     *
     * @param cat1Id - The ID of the first category.
     * @param val1 - The value from the first category.
     * @param cat2Id - The ID of the second category.
     * @param val2 - The value from the second category.
     * @returns true if the connection is possible, false otherwise.
     */
    isPossible(cat1Id: string, val1: ValueLabel, cat2Id: string, val2: ValueLabel): boolean;
    /**
     * Gets the number of possible connections for a specific value in one category
     * relative to another category.
     *
     * @param cat1Id - The ID of the starting category.
     * @param val1 - The value from the starting category.
     * @param cat2Id - The target category ID.
     * @returns The number of values in cat2 that are still possible for val1.
     */
    getPossibilitiesCount(cat1Id: string, val1: ValueLabel, cat2Id: string): number;
    /**
     * Calculates statistics about the current state of the grid.
     *
     * @returns An object containing:
     *  - totalPossible: The initial total logical connections.
     *  - currentPossible: The number of remaining possible connections.
     *  - solutionPossible: The target number of connections for a solved grid.
     */
    getGridStats(): {
        totalPossible: number;
        currentPossible: number;
        solutionPossible: number;
    };
    /**
     * Creates a deep copy of the current LogicGrid.
     *
     * @returns A new LogicGrid instance with the exact same state.
     */
    clone(): LogicGrid;
    /**
     * Compares this grid with a previous state and counts visual updates.
     * A "Visual Update" is defined as:
     * 1. A cell changing from Possible (True) to Eliminated (False) [Red Cross]
     * 2. A cell changing from Ambiguous (Count > 1) to Unique (Count == 1) [Green Check]
     *
     * @param prevGrid - The previous grid state.
     * @returns The number of visual updates.
     */
    compareVisualState(prevGrid: LogicGrid): number;
    /**
     * Checks if the grid is in a valid state (no cell has 0 possibilities).
     */
    isValid(): boolean;
}
