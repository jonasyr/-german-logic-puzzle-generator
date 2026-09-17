"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_CATEGORIES = void 0;
const types_1 = require("./types");
/**
 * A default set of categories for a standard logic puzzle (Name, Snack, Age).
 */
exports.DEFAULT_CATEGORIES = [
    {
        id: 'Name',
        type: types_1.CategoryType.NOMINAL,
        values: ['Alice', 'Bob', 'Charlie', 'David'],
    },
    {
        id: 'Snack',
        type: types_1.CategoryType.NOMINAL,
        values: ['Chips', 'Popcorn', 'Candy', 'Chocolate'],
    },
    {
        id: 'Age',
        type: types_1.CategoryType.ORDINAL,
        values: [20, 30, 40, 50],
    },
];
