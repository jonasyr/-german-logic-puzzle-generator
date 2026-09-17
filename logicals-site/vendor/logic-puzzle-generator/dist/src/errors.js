"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConfigurationError = exports.LogicPuzzleError = void 0;
/**
 * Base error class for Logic Puzzle Generator library.
 */
class LogicPuzzleError extends Error {
    constructor(message) {
        super(message);
        this.name = 'LogicPuzzleError';
    }
}
exports.LogicPuzzleError = LogicPuzzleError;
/**
 * Thrown when the provided configuration is invalid (e.g., duplicate IDs, mismatched sizes).
 */
class ConfigurationError extends LogicPuzzleError {
    constructor(message) {
        super(message);
        this.name = 'ConfigurationError';
    }
}
exports.ConfigurationError = ConfigurationError;
