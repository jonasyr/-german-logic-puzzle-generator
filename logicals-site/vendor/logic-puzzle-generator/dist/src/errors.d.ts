/**
 * Base error class for Logic Puzzle Generator library.
 */
export declare class LogicPuzzleError extends Error {
    constructor(message: string);
}
/**
 * Thrown when the provided configuration is invalid (e.g., duplicate IDs, mismatched sizes).
 */
export declare class ConfigurationError extends LogicPuzzleError {
    constructor(message: string);
}
