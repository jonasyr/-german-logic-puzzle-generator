"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stableSortInPlace = stableSortInPlace;
exports.seededShuffleInPlace = seededShuffleInPlace;
/**
 * Perform a stable sort in place, ensuring identical results across JS engines.
 * Maps elements to their original indices to guarantee stability when compareFn returns 0.
 */
function stableSortInPlace(arr, compareFn) {
    const stabilized = arr.map((val, idx) => ({ val, idx }));
    stabilized.sort((a, b) => {
        const order = compareFn ? compareFn(a.val, b.val) : (a.val < b.val ? -1 : a.val > b.val ? 1 : 0);
        if (order !== 0)
            return order;
        return a.idx - b.idx;
    });
    for (let i = 0; i < arr.length; i++) {
        arr[i] = stabilized[i].val;
    }
    return arr;
}
/**
 * Perform a deterministic Fisher-Yates shuffle in place.
 */
function seededShuffleInPlace(arr, randomFn) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(randomFn() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}
