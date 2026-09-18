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

    /**
     * Contradictions among the player's OWN marks.
     *
     * This never looks at the solution, which is why it can be shown without a
     * confirmation: it says "these marks cannot all be true together", never
     * "this one is wrong". `evaluate` is the one that knows the answer, and it
     * stays behind its gate.
     *
     * Notes are ignored - uncertainty is not a claim and cannot contradict.
     *
     * Only cells that carry a mark are ever reported, so the highlight always
     * lands on something the player actually did.
     */
    function findContradictions(marks, categoryCount, valueCount) {
        const found = new Set();
        const at = (a, va, b, vb) => marks.get(cellKey(a, va, b, vb));

        // Within one block: a value can be assigned once, and must be assignable.
        for (let a = 0; a < categoryCount; a++) {
            for (let b = a + 1; b < categoryCount; b++) {
                for (let line = 0; line < valueCount; line++) {
                    for (const alongRow of [true, false]) {
                        const key = index => (alongRow
                            ? pairKey(a, b, line, index)
                            : pairKey(a, b, index, line));

                        const confirmed = [];
                        let crossed = 0;
                        for (let index = 0; index < valueCount; index++) {
                            const mark = marks.get(key(index));
                            if (mark === 'yes') confirmed.push(key(index));
                            else if (mark === 'no') crossed++;
                        }

                        // Two things assigned to the same one.
                        if (confirmed.length > 1) for (const entry of confirmed) found.add(entry);
                        // Nothing left that could be assigned.
                        if (crossed === valueCount) {
                            for (let index = 0; index < valueCount; index++) found.add(key(index));
                        }
                    }
                }
            }
        }

        // Across blocks: A=B and A=C force B=C, so a cross there is impossible.
        for (let a = 0; a < categoryCount; a++) {
            for (let b = 0; b < categoryCount; b++) {
                if (b === a) continue;
                for (let c = b + 1; c < categoryCount; c++) {
                    if (c === a) continue;
                    for (let va = 0; va < valueCount; va++) {
                        for (let vb = 0; vb < valueCount; vb++) {
                            if (at(a, va, b, vb) !== 'yes') continue;
                            for (let vc = 0; vc < valueCount; vc++) {
                                if (at(a, va, c, vc) !== 'yes') continue;
                                if (at(b, vb, c, vc) !== 'no') continue;
                                found.add(cellKey(a, va, b, vb));
                                found.add(cellKey(a, va, c, vc));
                                found.add(cellKey(b, vb, c, vc));
                            }
                        }
                    }
                }
            }
        }

        return found;
    }

    return { pairKey, cellKey, buildTruthSet, evaluate, findContradictions };
});
