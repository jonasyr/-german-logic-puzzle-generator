"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BoundsCalculator = void 0;
const Generator_1 = require("./Generator");
const types_1 = require("../types");
class BoundsCalculator {
    static calculate(numCats, numItems, iterations = 20) {
        // Construct standard config
        const categories = [];
        for (let i = 0; i < numCats; i++) {
            categories.push({
                id: `C${i}`,
                type: types_1.CategoryType.NOMINAL,
                values: Array.from({ length: numItems }, (_, j) => `V${j}`)
            });
        }
        const target = {
            category1Id: 'C0',
            value1: 'V0',
            category2Id: 'C1'
        };
        let globalMin = Infinity;
        let globalMax = 0;
        // Run batch
        for (let i = 0; i < iterations; i++) {
            // Seed
            const seed = Date.now() + (i * 9999);
            const gen = new Generator_1.Generator(seed);
            const bounds = gen.getClueCountBounds(categories, target, 1); // 1 iteration of internal logic
            if (bounds.min > 0) {
                globalMin = Math.min(globalMin, bounds.min);
                globalMax = Math.max(globalMax, bounds.max);
            }
        }
        if (globalMin === Infinity)
            globalMin = 0;
        return { min: globalMin, max: globalMax };
    }
}
exports.BoundsCalculator = BoundsCalculator;
