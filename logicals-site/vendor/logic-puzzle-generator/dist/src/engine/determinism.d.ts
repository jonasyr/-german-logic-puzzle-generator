/**
 * Perform a stable sort in place, ensuring identical results across JS engines.
 * Maps elements to their original indices to guarantee stability when compareFn returns 0.
 */
export declare function stableSortInPlace<T>(arr: T[], compareFn?: (a: T, b: T) => number): T[];
/**
 * Perform a deterministic Fisher-Yates shuffle in place.
 */
export declare function seededShuffleInPlace<T>(arr: T[], randomFn: () => number): T[];
