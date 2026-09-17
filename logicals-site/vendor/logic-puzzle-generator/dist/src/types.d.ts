/**
 * A primitive value that acts as a label for an entity (e.g., "Alice", 42).
 */
export type ValueLabel = string | number;
/**
 * Defines the nature of a category's values.
 */
export declare enum CategoryType {
    /** Order is irrelevant (e.g., Name, Genre). */
    NOMINAL = 0,
    /** Order is crucial for comparisons (e.g., Age, Price). Values must be numbers. */
    ORDINAL = 1
}
/**
 * Configuration for a single category in the puzzle.
 */
export interface CategoryConfig {
    /** Unique internal identifier for the category (e.g., 'Name'). */
    id: string;
    /** The type of data this category holds. */
    type: CategoryType;
    /** The list of possible values. Must be unique. If ORDINAL, they must be sorted. */
    values: ValueLabel[];
}
/**
 * Represents the complete solution to the puzzle (the "answer key").
 * Structure: { CategoryID -> { Value -> CorrectValueInOtherCategory } }
 */
export type Solution = Record<string, Record<string, ValueLabel>>;
/**
 * A specific correlation that the puzzle solver aims to deduce as the final answer.
 */
export interface TargetFact {
    category1Id: string;
    value1: ValueLabel;
    category2Id: string;
}
/**
 * Enumeration of all supported clue types.
 */
export declare enum ClueType {
    /** Expresses a direct relationship (IS or IS NOT) between two values. */
    BINARY = 0,
    /** Expresses a comparison (GREATER THAN or LESS THAN) between two values based on an ordinal category. */
    ORDINAL = 1,
    /** Expresses an extreme value relationship (MIN or MAX) within an ordinal category. */
    SUPERLATIVE = 2,
    /** Expresses a property of a single value (e.g., IS EVEN) relative to an ordinal category. */
    UNARY = 3,
    /** Expresses a relationship between relative positions in two different ordinal categories. */
    CROSS_ORDINAL = 4,
    /** Expresses that a value is strictly between two other values on an ordinal scale. */
    BETWEEN = 5,
    /** Expresses that two values are adjacent (indices differ by 1) on an ordinal scale. */
    ADJACENCY = 6,
    /** Expresses valid disjunction: At least one of the sub-clues is true. */
    OR = 7,
    /** Expresses that the difference between two values is equal to the difference between two other values. */
    ARITHMETIC = 8
}
export declare enum CrossOrdinalOperator {
    MATCH = 0,
    NOT_MATCH = 1
}
export declare enum BinaryOperator {
    IS = 0,
    IS_NOT = 1
}
export declare enum OrdinalOperator {
    GREATER_THAN = 0,
    LESS_THAN = 1,
    NOT_GREATER_THAN = 2,
    NOT_LESS_THAN = 3
}
export declare enum SuperlativeOperator {
    MIN = 0,
    MAX = 1,
    NOT_MIN = 2,
    NOT_MAX = 3
}
export declare enum UnaryFilter {
    IS_ODD = 0,
    IS_EVEN = 1
}
/**
 * Configuration for constraining the types of clues generated.
 */
export interface ClueGenerationConstraints {
    /**
     * If provided, only clues of these types will be generated.
     * Use this to control difficulty or puzzle attributes.
     */
    allowedClueTypes?: ClueType[];
    /**
     * If provided, only clues that refer to these specific values (as subjects or objects) will be generated.
     * Useful for "Ask this suspect" mechanics.
     */
    includeSubjects?: string[];
    /**
     * If provided, clues referring to these values will be excluded.
     */
    excludeSubjects?: string[];
    /**
     * Minimum number of new deductions this clue must provide to be considered valid.
     * Default is 0 (allow all clues). Set to 1 to ensure progress.
     */
    minDeductions?: number;
    /**
     * Maximum number of new deductions this clue is allowed to provide.
     * Useful for finding low-impact or "filler" clues, or ensuring a clue isn't *too* powerful.
     */
    maxDeductions?: number;
}
export interface DeductionReason {
    type: 'elimination' | 'confirmation' | 'uniqueness' | 'transitivity' | 'clue' | 'unary' | 'ordinal' | 'cross_ordinal' | 'disjunction' | 'between';
    description: string;
    cells?: {
        cat: string;
        val: ValueLabel;
    }[];
}
/**
 * Configuration options for generating red herrings (falsy clues).
 */
export interface RedHerringOptions {
    /**
     * Number of red herrings to generate.
     * Default: 1 (when RedHerringOptions object is provided).
     */
    count?: number;
    /**
     * Minimum number of proof-chain steps required before the red herring can be contradicted.
     * Higher values ensure the red herring is more subtle and requires deeper deduction.
     * Default: 2 (prevents trivial 1-to-1 pairwise clashes).
     */
    minContradictionDepth?: number;
    /**
     * If provided, red herrings will only be generated using these clue types.
     */
    allowedClueTypes?: ClueType[];
}
