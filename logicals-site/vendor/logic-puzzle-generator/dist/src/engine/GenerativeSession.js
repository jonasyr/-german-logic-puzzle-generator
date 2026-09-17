"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GenerativeSession = void 0;
const types_1 = require("../types");
const errors_1 = require("../errors");
const LogicGrid_1 = require("./LogicGrid");
const Solver_1 = require("./Solver");
const determinism_1 = require("./determinism");
class GenerativeSession {
    constructor(generator, categories, solution, reverseSolution, valueMap, targetFact) {
        this.generator = generator;
        this.categories = categories;
        this.solution = solution;
        this.reverseSolution = reverseSolution;
        this.valueMap = valueMap;
        this.targetFact = targetFact;
        this.availableClues = [];
        this.proofChain = [];
        this.targetSolvedStepIndex = -1; // -1 means logic not solved by clues yet
        this.historyStack = [];
        this.grid = new LogicGrid_1.LogicGrid(categories);
        this.solver = new Solver_1.Solver();
        this.checkTargetSolved(); // Check initial state (unlikely solved unless trivial)
        // Initial Generation of ALL possibilities (we filter later)
        // We need access to the generator's clue generation logic.
        // We will call a public method on generator.
        this.availableClues = this.generator.generateAllPossibleClues(categories, undefined, reverseSolution, valueMap);
    }
    getTotalClueCount() {
        return this.availableClues.length;
    }
    getTargetSolvedStepIndex() {
        return this.targetSolvedStepIndex;
    }
    getMatchingClueCount(constraints) {
        return this.filterClues(constraints).length;
    }
    getMatchingClues(constraints, limit = 50) {
        const clues = this.filterClues(constraints);
        return clues.slice(0, limit);
    }
    getScoredMatchingClues(constraints, limit = 50) {
        const validClues = this.filterClues(constraints);
        const results = [];
        const minDeductions = constraints?.minDeductions ?? 0;
        const maxDeductions = constraints?.maxDeductions;
        if (maxDeductions !== undefined && minDeductions > maxDeductions) {
            throw new errors_1.ConfigurationError(`Invalid constraints: minDeductions (${minDeductions}) cannot be greater than maxDeductions (${maxDeductions}).`);
        }
        for (const clue of validClues) {
            const tempGrid = this.grid.clone();
            const { deductions } = this.solver.applyClue(tempGrid, clue);
            if (deductions < minDeductions)
                continue;
            if (maxDeductions !== undefined && deductions > maxDeductions)
                continue;
            const score = this.generator.calculateClueScore(this.grid, this.targetFact, deductions, clue, this.proofChain, this.solution, this.reverseSolution);
            let isDirectAnswer = false;
            if (clue.type === types_1.ClueType.BINARY) {
                const isPositive = clue.operator === types_1.BinaryOperator.IS;
                if (isPositive) {
                    const c = clue;
                    const matchForward = c.cat1 === this.targetFact.category1Id && c.val1 === this.targetFact.value1 && c.cat2 === this.targetFact.category2Id;
                    const matchReverse = c.cat2 === this.targetFact.category1Id && c.val2 === this.targetFact.value1 && c.cat1 === this.targetFact.category2Id;
                    if (matchForward || matchReverse) {
                        isDirectAnswer = true;
                    }
                }
            }
            // Calculate Projected % Complete
            const stats = tempGrid.getGridStats();
            const range = stats.totalPossible - stats.solutionPossible;
            const progress = stats.totalPossible - stats.currentPossible;
            let percentComplete = 0;
            if (range > 0) {
                percentComplete = Math.min(100, Math.max(0, (progress / range) * 100));
            }
            else {
                percentComplete = 100;
            }
            const updates = tempGrid.compareVisualState(this.grid);
            results.push({ clue, score, deductions, updates, isDirectAnswer, percentComplete });
        }
        return (0, determinism_1.stableSortInPlace)(results, (a, b) => b.score - a.score).slice(0, limit);
    }
    useClue(clue) {
        // Validate against solution (Anti-Cheat / Logic Guard)
        const isConsistent = this.generator.checkClueConsistency(clue, this.solution, this.reverseSolution, this.valueMap, this.categories);
        if (!isConsistent) {
            throw new Error("Invalid Clue: This clue contradicts the puzzle solution.");
        }
        // Ensure the clue is removed from available if it was there
        // (If searching, the UI passes a Clue object that should exist in our availableClues)
        this.applyAndSave(clue);
        return { remaining: this.availableClues.length, solved: this.generator.isPuzzleSolved(this.grid, this.solution, this.reverseSolution) };
    }
    filterClues(constraints) {
        return this.availableClues.filter(clue => {
            // 2. Constraints
            if (constraints?.allowedClueTypes && !constraints.allowedClueTypes.includes(clue.type))
                return false;
            // Validation: Check for intersection
            if (constraints?.includeSubjects && constraints?.excludeSubjects) {
                const intersection = constraints.includeSubjects.filter(s => constraints.excludeSubjects.includes(s));
                if (intersection.length > 0) {
                    throw new Error(`Constraint Error: The following subjects are both included and excluded: ${intersection.join(', ')}`);
                }
            }
            // Subject Constraints
            if (constraints?.includeSubjects || constraints?.excludeSubjects) {
                const valuesInClue = this.extractValuesFromClue(clue);
                if (constraints.includeSubjects) {
                    const hasMatch = constraints.includeSubjects.some(s => valuesInClue.includes(s));
                    if (!hasMatch)
                        return false;
                }
                if (constraints.excludeSubjects) {
                    const hasMatch = constraints.excludeSubjects.some(s => valuesInClue.includes(s));
                    if (hasMatch)
                        return false;
                }
            }
            return true;
        });
    }
    applyAndSave(clue) {
        // Save state
        this.historyStack.push(this.grid.clone());
        // Apply it
        const result = this.solver.applyClue(this.grid, clue);
        clue.deductions = result.deductions;
        clue.reasons = result.reasons;
        // Calculate % Complete
        // Grid starts with 'totalPossible' and ends with 'solutionPossible'.
        // % = (Total - Current) / (Total - Solution)
        const stats = this.grid.getGridStats();
        // Avoid division by zero if puzzle is tiny or trivial
        const range = stats.totalPossible - stats.solutionPossible;
        const progress = stats.totalPossible - stats.currentPossible;
        if (range > 0) {
            clue.percentComplete = Math.min(100, Math.max(0, (progress / range) * 100));
        }
        else {
            clue.percentComplete = 100;
        }
        // Calculate Visual Updates (Red Crosses + Green Checks)
        // We compare the grid before (this.historyStack.last?) application
        // Wait, 'this.grid' is ALREADY modified here.
        // We saved the previous state in historyStack.
        const prevGrid = this.historyStack[this.historyStack.length - 1];
        if (prevGrid) {
            clue.updates = this.grid.compareVisualState(prevGrid);
        }
        else {
            // Should not happen unless history empty? Initial state?
            clue.updates = clue.deductions; // Fallback
        }
        this.proofChain.push(clue);
        // Check if target is solved now (if it wasn't before)
        if (this.targetSolvedStepIndex === -1) {
            const isSolved = this.checkTargetSolvedInternal();
            if (isSolved) {
                this.targetSolvedStepIndex = this.proofChain.length - 1;
            }
        }
        // Remove from available
        const idx = this.availableClues.indexOf(clue);
        if (idx > -1)
            this.availableClues.splice(idx, 1);
    }
    checkTargetSolvedInternal() {
        // Check if the specific target fact is confirmed in the grid
        // Fact: (Cat1, Val1) is linked to (Cat2) -> ?
        // We need to check if grid has determined the link.
        // targetFact has Cat1, Val1, Cat2.
        // Ideally we check if Possibilities(Cat1, Val1, Cat2) === 1.
        // Wait, TargetFact structure:
        // { category1Id, value1, category2Id, value2? }
        // If value2 is present (specific pairing target), we check isFactConfirmed.
        // If value2 is NOT present (general "find the husband" target), we check if ANY link is confirmed?
        // Actually, usually the target is "Find the Value in Cat2 for (Cat1, Val1)".
        // So we check if the Number of Possibilities for (Cat1, Val1) in Cat2 is exactly 1.
        return this.grid.getPossibilitiesCount(this.targetFact.category1Id, this.targetFact.value1, this.targetFact.category2Id) === 1;
    }
    checkTargetSolved() {
        if (this.checkTargetSolvedInternal()) {
            // If solved at start (step -1?) logic handles index relative to proof chain.
            // If solved initially, maybe index is -1?
            // But if it's -1, it means "Before any clues".
            // Let's stick to -1 being "Not Found Yet" vs "Found at Initial State"?
            // If found at start, we might want to know.
            // But normally target is unknown.
            // Let's assume -1 is "Not Solved".
        }
    }
    getNextClue(constraints) {
        const validClues = this.filterClues(constraints);
        // Score them
        let bestClue = null;
        let bestScore = -Infinity;
        // Shuffle validClues first to ensure variety.
        const candidates = (0, determinism_1.seededShuffleInPlace)([...validClues], Math.random);
        // Take top N candidates?
        const searchLimit = 50;
        let checked = 0;
        const minDeductions = constraints?.minDeductions ?? 0;
        const maxDeductions = constraints?.maxDeductions;
        if (maxDeductions !== undefined && minDeductions > maxDeductions) {
            throw new errors_1.ConfigurationError(`Invalid constraints: minDeductions (${minDeductions}) cannot be greater than maxDeductions (${maxDeductions}).`);
        }
        for (const clue of candidates) {
            checked++;
            if (checked > searchLimit && bestClue)
                break; // found something good enough?
            // Score Logic
            // We must clone grid and apply to see deductions.
            const tempGrid = this.grid.clone();
            const { deductions } = this.solver.applyClue(tempGrid, clue);
            // Check Deduction Floor
            if (deductions < minDeductions) {
                continue;
            }
            if (maxDeductions !== undefined && deductions > maxDeductions) {
                continue;
            }
            // Re-calc score with deductions
            const realScore = this.generator.calculateClueScore(this.grid, this.targetFact, deductions, clue, this.proofChain, this.solution, this.reverseSolution);
            // Calculate Projected % Complete
            const stats = tempGrid.getGridStats();
            const range = stats.totalPossible - stats.solutionPossible;
            const progress = stats.totalPossible - stats.currentPossible;
            let percentComplete = 0;
            if (range > 0) {
                percentComplete = Math.min(100, Math.max(0, (progress / range) * 100));
            }
            else {
                percentComplete = 100;
            }
            if (realScore > bestScore) {
                bestScore = realScore;
                bestClue = clue;
            }
            // Note: getScoredMatchingClues will need to collect this.
            // But this is getNextClue.
            // Wait, I need to update getScoredMatchingClues, not getNextClue loop?
            // Yes, user said "search list".
            // Let's modify getScoredMatchingClues below, but first let me fix the tool call target.
        }
        if (bestClue) {
            this.applyAndSave(bestClue);
            return { clue: bestClue, remaining: this.availableClues.length, solved: this.generator.isPuzzleSolved(this.grid, this.solution, this.reverseSolution) };
        }
        return { clue: null, remaining: validClues.length, solved: this.generator.isPuzzleSolved(this.grid, this.solution, this.reverseSolution) };
    }
    /**
     * Asynchronously gets the next clue (non-blocking wrapper).
     * @param constraints
     */
    async getNextClueAsync(constraints) {
        return new Promise((resolve, reject) => {
            setTimeout(() => {
                try {
                    const result = this.getNextClue(constraints);
                    resolve(result);
                }
                catch (e) {
                    reject(e);
                }
            }, 0);
        });
    }
    rollbackLastClue() {
        if (this.historyStack.length === 0)
            return { success: false, clue: null };
        const prevGrid = this.historyStack.pop();
        if (prevGrid)
            this.grid = prevGrid;
        const lastClue = this.proofChain.pop();
        if (lastClue) {
            this.availableClues.push(lastClue);
            return { success: true, clue: lastClue };
        }
        return { success: false, clue: null };
    }
    isUseful(grid) {
        // Did it eliminate anything? 
        // LogicGrid could report this.
        // We compare clone vs original?
        // Actually Solver returns deductions count.
        // If deductions > 0, it's useful.
        return true;
    }
    /**
     * Removes a clue from the proof chain at the specified index.
     * Replays all subsequent clues to ensure state consistency.
     * @param index Index of the clue in the proofChain (0-based)
     */
    removeClueAt(index) {
        if (index < 0 || index >= this.proofChain.length)
            return false;
        const removedClue = this.proofChain[index];
        // 1. Remove from proofChain
        this.proofChain.splice(index, 1);
        // 2. Return to availableClues
        this.availableClues.push(removedClue);
        // 3. Replay Logic
        return this.replayProofChain();
    }
    /**
     * Moves a clue from one index to another in the proof chain.
     * Replays all clues to update metadata and target detection.
     */
    moveClue(fromIndex, toIndex) {
        if (fromIndex < 0 || fromIndex >= this.proofChain.length)
            return false;
        if (toIndex < 0 || toIndex >= this.proofChain.length)
            return false;
        if (fromIndex === toIndex)
            return true; // No op
        const clue = this.proofChain[fromIndex];
        // Remove
        this.proofChain.splice(fromIndex, 1);
        // Insert
        this.proofChain.splice(toIndex, 0, clue);
        return this.replayProofChain();
    }
    replayProofChain() {
        // Reset grid to initial state
        this.grid = new LogicGrid_1.LogicGrid(this.categories);
        this.historyStack = []; // Reset history
        this.solver = new Solver_1.Solver(); // Fresh solver (stateless anyway)
        this.targetSolvedStepIndex = -1; // Reset target detection
        // Check if solved initially (unlikely)
        if (this.checkTargetSolvedInternal()) {
            // If solved with 0 clues, maybe set to -1 (start)? 
            // Or a special value? Let's leave it -1 and handle it?
            // Actually if it's solved at start, then stepIndex = -1 makes sense if we consider 0-based index of clues.
            // But usually we mark "Revealed AFTER step X".
        }
        // Put ALL proofChain clues back into available first (so applyAndSave finds them)
        // We must push them all back because applyAndSave will splice them out.
        // Note: availableClues might ideally be a Set or map for speed, but array is fine for now.
        // We should add them ONLY if they are not already there?
        // Actually, proofChain clues are NOT in availableClues.
        this.availableClues.push(...this.proofChain);
        // Capture chain
        const chainToReplay = [...this.proofChain];
        // Clear proofChain
        this.proofChain = [];
        // Re-apply
        for (const c of chainToReplay) {
            this.applyAndSave(c);
        }
        return true;
    }
    // Getters for UI
    getGrid() { return this.grid; }
    getProofChain() { return this.proofChain; }
    getSolution() { return this.solution; }
    getValueMap() { return this.valueMap; }
    extractValuesFromClue(clue) {
        const values = [];
        // Extract based on type (simpler than full traversal)
        // We cast values to string for easy comparison
        const add = (v) => { if (v !== undefined)
            values.push(String(v)); };
        // Common fields
        // @ts-ignore
        add(clue.val1);
        // @ts-ignore
        add(clue.val2);
        // @ts-ignore
        add(clue.item1Val);
        // @ts-ignore
        add(clue.item2Val);
        // @ts-ignore
        add(clue.targetVal);
        return values;
    }
    /**
     * Retrieves all viable red herrings (falsy clues) that are contradicted by the current session's proof chain
     * and do not create 1-to-1 direct clashes with any selected clue.
     */
    getAvailableRedHerrings(options) {
        if (this.proofChain.length < 2)
            return [];
        const candidateFalseClues = this.generator.generateCandidateFalseClues(this.categories, options, this.reverseSolution, this.valueMap, this.solution);
        const minDepth = options?.minContradictionDepth ?? 2;
        const available = [];
        for (const candidate of candidateFalseClues) {
            // Must be contradicted by current session grid
            if (!this.solver.isClueContradicted(this.grid, candidate)) {
                continue;
            }
            // Stealth check: Must not clash in isolation with any single clue in proofChain
            let directClash = false;
            if (minDepth >= 2) {
                for (const trueClue of this.proofChain) {
                    const singleGrid = new LogicGrid_1.LogicGrid(this.categories);
                    this.solver.applyClue(singleGrid, trueClue);
                    if (this.solver.isClueContradicted(singleGrid, candidate)) {
                        directClash = true;
                        break;
                    }
                }
            }
            if (!directClash) {
                available.push(candidate);
            }
        }
        return available;
    }
    /**
     * Generates a single red herring clue for the current session state.
     * Returns null if no viable red herrings exist for the current proof chain.
     */
    generateRedHerring(options) {
        const candidates = this.getAvailableRedHerrings(options);
        if (candidates.length === 0) {
            return null;
        }
        try {
            const redHerrings = this.generator.generateRedHerrings(this.categories, this.proofChain, { ...options, count: 1 }, this.reverseSolution, this.valueMap, this.solution);
            return redHerrings[0] ?? null;
        }
        catch {
            return null;
        }
    }
}
exports.GenerativeSession = GenerativeSession;
