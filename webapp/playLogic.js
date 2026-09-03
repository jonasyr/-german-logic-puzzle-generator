/**
 * Pure rules of the play grid, shared by the browser and the test suite:
 * which cell belongs to which pair, which pairs the solution marks as correct,
 * and how a set of user marks scores against it.
 */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.PlayLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /** Key of a cell, always with the lower category index first. */
    function pairKey(categoryA, categoryB, valueA, valueB) {
        return `${categoryA}.${categoryB}.${valueA}.${valueB}`;
    }

    function cellKey(rowCategory, rowValue, colCategory, colValue) {
        return rowCategory < colCategory
            ? pairKey(rowCategory, colCategory, rowValue, colValue)
            : pairKey(colCategory, rowCategory, colValue, rowValue);
    }

    /** Every cell key that the puzzle's solution rows mark as belonging together. */
    function buildTruthSet(puzzle) {
        const labels = puzzle.categories.map(category => category.label);
        const indexes = puzzle.categories.map(
            category => new Map(category.values.map((value, index) => [value, index])),
        );
        const truth = new Set();
        for (const row of puzzle.solutionRows) {
            for (let a = 0; a < puzzle.categories.length; a++) {
                for (let b = a + 1; b < puzzle.categories.length; b++) {
                    const valueA = indexes[a].get(row[labels[a]]);
                    const valueB = indexes[b].get(row[labels[b]]);
                    if (valueA !== undefined && valueB !== undefined) {
                        truth.add(pairKey(a, b, valueA, valueB));
                    }
                }
            }
        }
        return truth;
    }

    /**
     * Scores the current marks. `wrong` holds every mark that contradicts the
     * solution, `missing` counts correct assignments not yet ticked, and a puzzle
     * counts as solved once all of them are ticked and nothing wrong is ticked.
     */
    function evaluate(marks, truth) {
        const wrong = new Set();
        for (const [key, mark] of marks) {
            const shouldMatch = truth.has(key);
            if ((mark === 'yes' && !shouldMatch) || (mark === 'no' && shouldMatch)) wrong.add(key);
        }

        let missing = 0;
        for (const key of truth) {
            if (marks.get(key) !== 'yes') missing++;
        }

        let wrongTick = false;
        for (const [key, mark] of marks) {
            if (mark === 'yes' && !truth.has(key)) { wrongTick = true; break; }
        }

        return { wrong, missing, solved: missing === 0 && !wrongTick };
    }

    return { pairKey, cellKey, buildTruthSet, evaluate };
});
