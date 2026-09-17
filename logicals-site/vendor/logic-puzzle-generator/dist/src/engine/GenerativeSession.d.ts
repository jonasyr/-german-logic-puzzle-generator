import { CategoryConfig, ClueGenerationConstraints, Solution, TargetFact, ValueLabel, RedHerringOptions } from '../types';
import { Clue } from './Clue';
import { LogicGrid } from './LogicGrid';
import type { Generator } from './Generator';
export declare class GenerativeSession {
    private generator;
    private categories;
    private solution;
    private reverseSolution;
    private valueMap;
    targetFact: TargetFact;
    private grid;
    private availableClues;
    private proofChain;
    private solver;
    private targetSolvedStepIndex;
    private historyStack;
    constructor(generator: Generator, categories: CategoryConfig[], solution: Solution, reverseSolution: Map<string, Map<ValueLabel, ValueLabel>>, valueMap: Map<ValueLabel, Record<string, ValueLabel>>, targetFact: TargetFact);
    getTotalClueCount(): number;
    getTargetSolvedStepIndex(): number;
    getMatchingClueCount(constraints?: ClueGenerationConstraints): number;
    getMatchingClues(constraints?: ClueGenerationConstraints, limit?: number): Clue[];
    getScoredMatchingClues(constraints?: ClueGenerationConstraints, limit?: number): {
        clue: Clue;
        score: number;
        deductions: number;
        updates: number;
        isDirectAnswer: boolean;
        percentComplete: number;
    }[];
    useClue(clue: Clue): {
        remaining: number;
        solved: boolean;
    };
    private filterClues;
    private applyAndSave;
    private checkTargetSolvedInternal;
    private checkTargetSolved;
    getNextClue(constraints?: ClueGenerationConstraints): {
        clue: Clue | null;
        remaining: number;
        solved: boolean;
    };
    /**
     * Asynchronously gets the next clue (non-blocking wrapper).
     * @param constraints
     */
    getNextClueAsync(constraints?: ClueGenerationConstraints): Promise<{
        clue: Clue | null;
        remaining: number;
        solved: boolean;
    }>;
    rollbackLastClue(): {
        success: boolean;
        clue: Clue | null;
    };
    private isUseful;
    /**
     * Removes a clue from the proof chain at the specified index.
     * Replays all subsequent clues to ensure state consistency.
     * @param index Index of the clue in the proofChain (0-based)
     */
    removeClueAt(index: number): boolean;
    /**
     * Moves a clue from one index to another in the proof chain.
     * Replays all clues to update metadata and target detection.
     */
    moveClue(fromIndex: number, toIndex: number): boolean;
    private replayProofChain;
    getGrid(): LogicGrid;
    getProofChain(): Clue[];
    getSolution(): Solution;
    getValueMap(): Map<ValueLabel, Record<string, ValueLabel>>;
    private extractValuesFromClue;
    /**
     * Retrieves all viable red herrings (falsy clues) that are contradicted by the current session's proof chain
     * and do not create 1-to-1 direct clashes with any selected clue.
     */
    getAvailableRedHerrings(options?: RedHerringOptions): Clue[];
    /**
     * Generates a single red herring clue for the current session state.
     * Returns null if no viable red herrings exist for the current proof chain.
     */
    generateRedHerring(options?: RedHerringOptions): Clue | null;
}
