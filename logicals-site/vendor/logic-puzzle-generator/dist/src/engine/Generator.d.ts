import { CategoryConfig, ValueLabel, Solution, TargetFact, ClueGenerationConstraints, RedHerringOptions } from '../types';
import { Clue } from './Clue';
import { LogicGrid } from './LogicGrid';
import { GenerativeSession } from './GenerativeSession';
/**
 * Computes the guaranteed safe maximum number of mutually compatible red herrings
 * supported by a category configuration without risking ambiguous (dual-universe) solutions.
 *
 * @param categories - The category configurations.
 * @returns Maximum safe red herring count (0 if the configuration cannot support red herrings).
 */
export declare function getSafeMaxRedHerrings(categories: CategoryConfig[]): number;
/**
 * Represents a single step in the logical deduction path.
 */
export interface ProofStep {
    /** The clue applied at this step. */
    clue: Clue;
    /** The number of logical eliminations that resulted immediately from this clue. */
    deductions: number;
}
/**
 * The complete result of the puzzle generation process.
 */
export interface Puzzle {
    /** The solution grid (Category -> Value -> Corresponding Value). */
    solution: Solution;
    /** The list of all clues presented to the solver. If red herrings were requested, includes both valid clues and red herrings. */
    clues: Clue[];
    /** The verified truthy clues that uniquely solve the puzzle. */
    validClues: Clue[];
    /** The generated red herring clues that are logically contradicted by the valid clues. */
    redHerrings: Clue[];
    /** An ordered list of clues that demonstrates a step-by-step logical solution for the valid clues. */
    proofChain: ProofStep[];
    /** The configuration used to generate this puzzle. */
    categories: CategoryConfig[];
    /** The specific fact that the puzzle is designed to reveal at the end. */
    targetFact: TargetFact;
}
/**
 * Configuration options for the puzzle generation process.
 */
export interface GeneratorOptions {
    /**
     * The maximum number of candidate clues to evaluate at each step.
     * Lower values improve performance for large grids but may slightly reduce puzzle quality.
     * Default: Infinity (Exhaustive search).
     */
    maxCandidates?: number;
    /**
     * Attempt to generate a puzzle with exactly this many clues.
     * The generator will use backtracking to find a path of this length.
     * May throw an error if the count is infeasible.
     */
    targetClueCount?: number;
    /**
     * Timeout in milliseconds for the generation process.
     * Default: 10000ms (10s).
     */
    timeoutMs?: number;
    /**
     * Constraints to filter the types of clues generated.
     */
    constraints?: ClueGenerationConstraints;
    /**
     * Optional red herring (fake clues) configuration.
     * Can be specified as a number (e.g. 1) or a RedHerringOptions object.
     * Default: 0 (disabled).
     */
    redHerrings?: number | RedHerringOptions;
    /**
     * Callback for trace logs execution details.
     */
    onTrace?: (message: string) => void;
}
/**
 * The main class responsible for generating logic puzzles.
 *
 * It handles the creation of a consistent solution, the generation of all possible clues,
 * and the selection of an optimal set of clues to form a solvable puzzle with a specific target.
 */
export declare class Generator {
    private seed;
    private random;
    private solver;
    private solution;
    private valueMap;
    private reverseSolution;
    /**
     * Creates a new Generator instance.
     *
     * @param seed - A numeric seed for the random number generator to ensure reproducibility.
     */
    constructor(seed: number);
    /**
     * Generates a fully solvable logic puzzle based on the provided configuration.
     * Estimates the minimum and maximum number of clues required to solve a puzzle
     * for the given configuration and target, by running several simulations.
     * This is a computationally intensive operation.
     *
     * @param categories - The categories and values to include in the puzzle.
     * @param target - The specific fact that should be the final deduction of the puzzle.
     * @returns A promise resolving to an object containing the estimated min and max clue counts.
     */
    getClueCountBounds(categories: CategoryConfig[], target: TargetFact, maxIterations?: number): {
        min: number;
        max: number;
    };
    /**
     * Generates a fully solvable logic puzzle.
     * @param categories - The categories config.
     * @param target - Optional target fact. If missing, a random one is synthesized.
     * @param config - Generation options.
     */
    generatePuzzle(categories: CategoryConfig[], target?: TargetFact, config?: GeneratorOptions): Puzzle;
    /**
     * Helper to validate a target against categories
     */
    private validateTarget;
    /**
     * Helper to generate a random target
     */
    private generateRandomTarget;
    /**
     * Asynchronously generates a puzzle (non-blocking wrapper).
     * @param categories
     * @param target
     * @param config
     */
    generatePuzzleAsync(categories: CategoryConfig[], target?: TargetFact, config?: GeneratorOptions): Promise<Puzzle>;
    /**
     * Asynchronously estimates clue count bounds (non-blocking wrapper).
     * @param categories
     * @param target
     * @param maxIterations
     */
    getClueCountBoundsAsync(categories: CategoryConfig[], target: TargetFact, maxIterations?: number): Promise<{
        min: number;
        max: number;
    }>;
    /**
     * Starts an interactive generative session.
     * @param categories
     * @param target Optional target fact.
     */
    startSession(categories: CategoryConfig[], target?: TargetFact): GenerativeSession;
    /**
     * Internal generation method exposed for simulations.
     * @param strategy 'standard' | 'min' | 'max'
     */
    internalGenerate(categories: CategoryConfig[], target: TargetFact, strategy: 'standard' | 'min' | 'max', options?: GeneratorOptions): Puzzle;
    private generateWithBacktracking;
    private createSolution;
    generateAllPossibleClues(categories: CategoryConfig[], constraints: ClueGenerationConstraints | undefined, reverseSolution: Map<string, Map<ValueLabel, ValueLabel>>, valueMap: Map<ValueLabel, Record<string, ValueLabel>>): Clue[];
    /**
     * Calculates the heuristic score for a candidate clue.
     * Higher scores represent better clues according to the current strategy.
     */
    calculateClueScore(grid: LogicGrid, target: TargetFact, deductions: number, clue: Clue, previouslySelectedClues: Clue[], solution: Solution, reverseSolution: Map<string, Map<ValueLabel, ValueLabel>>): number;
    /**
     * Checks if a clue is logically consistent with the provided solution.
     * Returns true if the clue is TRUE in the context of the solution.
     * Returns false if the clue is FALSE (contradicts the solution).
     */
    checkClueConsistency(clue: Clue, solution: Solution, reverseSolution: Map<string, Map<ValueLabel, ValueLabel>>, valueMap: Map<ValueLabel, Record<string, ValueLabel>>, categories: CategoryConfig[]): boolean;
    isPuzzleSolved(grid: LogicGrid, solution: Solution, reverseSolution: Map<string, Map<ValueLabel, ValueLabel>>): boolean;
    /**
     * Generates all possible candidate false clues (clues that contradict the ground truth solution).
     */
    generateCandidateFalseClues(categories: CategoryConfig[], constraints?: ClueGenerationConstraints | RedHerringOptions, reverseSolution?: Map<string, Map<ValueLabel, ValueLabel>>, valueMap?: Map<ValueLabel, Record<string, ValueLabel>>, solution?: Solution): Clue[];
    /**
     * Generates a verified list of K stealthy, unambiguous, mutually compatible red herrings for a given puzzle.
     *
     * @param categories - The puzzle category configurations.
     * @param validClues - The true clues that form the valid solution.
     * @param options - Red herring options.
     * @returns An array of generated red herring clues.
     */
    generateRedHerrings(categories: CategoryConfig[], validClues: Clue[], options?: RedHerringOptions, reverseSolution?: Map<string, Map<ValueLabel, ValueLabel>>, valueMap?: Map<ValueLabel, Record<string, ValueLabel>>, solution?: Solution): Clue[];
    /**
     * Helper to generate all combinations of size k from an array.
     */
    private getCombinations;
}
