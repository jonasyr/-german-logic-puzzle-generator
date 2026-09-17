"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UnaryFilter = exports.SuperlativeOperator = exports.OrdinalOperator = exports.BinaryOperator = exports.CrossOrdinalOperator = exports.ClueType = exports.CategoryType = void 0;
/**
 * Defines the nature of a category's values.
 */
var CategoryType;
(function (CategoryType) {
    /** Order is irrelevant (e.g., Name, Genre). */
    CategoryType[CategoryType["NOMINAL"] = 0] = "NOMINAL";
    /** Order is crucial for comparisons (e.g., Age, Price). Values must be numbers. */
    CategoryType[CategoryType["ORDINAL"] = 1] = "ORDINAL";
})(CategoryType || (exports.CategoryType = CategoryType = {}));
/**
 * Enumeration of all supported clue types.
 */
var ClueType;
(function (ClueType) {
    /** Expresses a direct relationship (IS or IS NOT) between two values. */
    ClueType[ClueType["BINARY"] = 0] = "BINARY";
    /** Expresses a comparison (GREATER THAN or LESS THAN) between two values based on an ordinal category. */
    ClueType[ClueType["ORDINAL"] = 1] = "ORDINAL";
    /** Expresses an extreme value relationship (MIN or MAX) within an ordinal category. */
    ClueType[ClueType["SUPERLATIVE"] = 2] = "SUPERLATIVE";
    /** Expresses a property of a single value (e.g., IS EVEN) relative to an ordinal category. */
    ClueType[ClueType["UNARY"] = 3] = "UNARY";
    /** Expresses a relationship between relative positions in two different ordinal categories. */
    ClueType[ClueType["CROSS_ORDINAL"] = 4] = "CROSS_ORDINAL";
    /** Expresses that a value is strictly between two other values on an ordinal scale. */
    ClueType[ClueType["BETWEEN"] = 5] = "BETWEEN";
    /** Expresses that two values are adjacent (indices differ by 1) on an ordinal scale. */
    ClueType[ClueType["ADJACENCY"] = 6] = "ADJACENCY";
    /** Expresses valid disjunction: At least one of the sub-clues is true. */
    ClueType[ClueType["OR"] = 7] = "OR";
    /** Expresses that the difference between two values is equal to the difference between two other values. */
    ClueType[ClueType["ARITHMETIC"] = 8] = "ARITHMETIC";
})(ClueType || (exports.ClueType = ClueType = {}));
var CrossOrdinalOperator;
(function (CrossOrdinalOperator) {
    CrossOrdinalOperator[CrossOrdinalOperator["MATCH"] = 0] = "MATCH";
    CrossOrdinalOperator[CrossOrdinalOperator["NOT_MATCH"] = 1] = "NOT_MATCH";
})(CrossOrdinalOperator || (exports.CrossOrdinalOperator = CrossOrdinalOperator = {}));
var BinaryOperator;
(function (BinaryOperator) {
    BinaryOperator[BinaryOperator["IS"] = 0] = "IS";
    BinaryOperator[BinaryOperator["IS_NOT"] = 1] = "IS_NOT";
})(BinaryOperator || (exports.BinaryOperator = BinaryOperator = {}));
var OrdinalOperator;
(function (OrdinalOperator) {
    OrdinalOperator[OrdinalOperator["GREATER_THAN"] = 0] = "GREATER_THAN";
    OrdinalOperator[OrdinalOperator["LESS_THAN"] = 1] = "LESS_THAN";
    OrdinalOperator[OrdinalOperator["NOT_GREATER_THAN"] = 2] = "NOT_GREATER_THAN";
    OrdinalOperator[OrdinalOperator["NOT_LESS_THAN"] = 3] = "NOT_LESS_THAN";
})(OrdinalOperator || (exports.OrdinalOperator = OrdinalOperator = {}));
var SuperlativeOperator;
(function (SuperlativeOperator) {
    SuperlativeOperator[SuperlativeOperator["MIN"] = 0] = "MIN";
    SuperlativeOperator[SuperlativeOperator["MAX"] = 1] = "MAX";
    SuperlativeOperator[SuperlativeOperator["NOT_MIN"] = 2] = "NOT_MIN";
    SuperlativeOperator[SuperlativeOperator["NOT_MAX"] = 3] = "NOT_MAX";
})(SuperlativeOperator || (exports.SuperlativeOperator = SuperlativeOperator = {}));
var UnaryFilter;
(function (UnaryFilter) {
    UnaryFilter[UnaryFilter["IS_ODD"] = 0] = "IS_ODD";
    UnaryFilter[UnaryFilter["IS_EVEN"] = 1] = "IS_EVEN";
})(UnaryFilter || (exports.UnaryFilter = UnaryFilter = {}));
