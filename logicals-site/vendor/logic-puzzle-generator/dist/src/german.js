"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatClueGerman = formatClueGerman;
const types_1 = require("./types");
const DEFAULT_LANGUAGE = {
    baseCategoryId: 'Person',
    categories: {
        Person: { label: 'Person', reference: '{value}' },
        Getraenk: {
            label: 'Getränk',
            reference: 'die Person, die {value} trinkt',
            subjectComma: true,
            predicate: 'trinkt {value}',
            negativePredicate: 'trinkt keinen {value}',
        },
        Startzeit: { label: 'Startzeit', reference: 'die Person mit Startzeit {value}' },
        Punktzahl: { label: 'Punktzahl', reference: 'die Person mit {value} Punkten' },
    },
    ordinals: {
        Startzeit: {
            label: 'Startzeit', greater: 'startet später als', less: 'startet früher als',
            notGreater: 'startet nicht später als', notLess: 'startet nicht früher als',
            minimum: 'startet als Erste', maximum: 'startet als Letzte',
            notMinimum: 'startet nicht als Erste', notMaximum: 'startet nicht als Letzte',
            after: 'startet nach', before: 'vor',
            adjacent: 'startet unmittelbar vor oder nach', parityNoun: 'Startzeit',
        },
    },
};
function interpolate(template, value) {
    return template.split('{value}').join(String(value));
}
function renderedValue(language, category, value) {
    return categoryWording(language, category).formatValue?.(value) ?? value;
}
function categoryWording(language, category) {
    return language.categories[category] ?? {
        label: category,
        reference: `die Person mit ${category} „{value}“`,
    };
}
function ordinalWording(language, category) {
    return language.ordinals[category] ?? {
        label: category, greater: 'liegt höher als', less: 'liegt niedriger als',
        notGreater: 'liegt nicht höher als', notLess: 'liegt nicht niedriger als',
        minimum: 'hat den niedrigsten Wert', maximum: 'hat den höchsten Wert',
        notMinimum: 'hat nicht den niedrigsten Wert', notMaximum: 'hat nicht den höchsten Wert',
        after: 'liegt nach', before: 'liegt vor', adjacent: 'liegt unmittelbar neben',
        parityNoun: category,
    };
}
function reference(category, value, language) {
    if (category === language.baseCategoryId) {
        return String(value);
    }
    return interpolate(categoryWording(language, category).reference, renderedValue(language, category, value));
}
function sentenceSubject(text) {
    return text.charAt(0).toLocaleUpperCase('de-DE') + text.slice(1);
}
function subjectReference(category, value, language) {
    const rendered = sentenceSubject(reference(category, value, language));
    return categoryWording(language, category).subjectComma ? `${rendered},` : rendered;
}
function dativeReference(category, value, language) {
    return reference(category, value, language).replace(/^die Person\b/, 'der Person');
}
function relationReference(relation, category, value, language) {
    const requiresDative = /\b(?:nach|vor|über|unter)(?:\s|$)/.test(relation);
    return requiresDative
        ? dativeReference(category, value, language)
        : reference(category, value, language);
}
function renderBinary(clue, language) {
    const cat1Wording = categoryWording(language, clue.cat1);
    const cat2Wording = categoryWording(language, clue.cat2);
    if (clue.cat1 === language.baseCategoryId && cat2Wording.predicate) {
        const predicate = clue.operator === types_1.BinaryOperator.IS
            ? cat2Wording.predicate
            : (cat2Wording.negativePredicate ?? `nicht ${cat2Wording.predicate}`);
        return `${clue.val1} ${interpolate(predicate, renderedValue(language, clue.cat2, clue.val2))}.`;
    }
    if (clue.cat2 === language.baseCategoryId && cat1Wording.predicate) {
        const predicate = clue.operator === types_1.BinaryOperator.IS
            ? cat1Wording.predicate
            : (cat1Wording.negativePredicate ?? `nicht ${cat1Wording.predicate}`);
        return `${clue.val2} ${interpolate(predicate, renderedValue(language, clue.cat1, clue.val1))}.`;
    }
    const relation = clue.operator === types_1.BinaryOperator.IS ? 'ist' : 'ist nicht';
    return `${subjectReference(clue.cat1, clue.val1, language)} ${relation} ${reference(clue.cat2, clue.val2, language)}.`;
}
function renderOrdinal(clue, language) {
    const wording = ordinalWording(language, clue.ordinalCat);
    const relation = {
        [types_1.OrdinalOperator.GREATER_THAN]: wording.greater,
        [types_1.OrdinalOperator.LESS_THAN]: wording.less,
        [types_1.OrdinalOperator.NOT_GREATER_THAN]: wording.notGreater,
        [types_1.OrdinalOperator.NOT_LESS_THAN]: wording.notLess,
    };
    return `${subjectReference(clue.item1Cat, clue.item1Val, language)} ${relation[clue.operator]} ${reference(clue.item2Cat, clue.item2Val, language)}.`;
}
function renderSuperlative(clue, language) {
    const wording = ordinalWording(language, clue.ordinalCat);
    const relation = {
        [types_1.SuperlativeOperator.MIN]: wording.minimum,
        [types_1.SuperlativeOperator.MAX]: wording.maximum,
        [types_1.SuperlativeOperator.NOT_MIN]: wording.notMinimum,
        [types_1.SuperlativeOperator.NOT_MAX]: wording.notMaximum,
    };
    return `${subjectReference(clue.targetCat, clue.targetVal, language)} ${relation[clue.operator]}.`;
}
function renderUnary(clue, language) {
    const parity = clue.filter === types_1.UnaryFilter.IS_EVEN ? 'gerade' : 'ungerade';
    const wording = ordinalWording(language, clue.ordinalCat);
    return `${subjectReference(clue.targetCat, clue.targetVal, language)} hat eine ${parity} ${wording.parityNoun}.`;
}
function renderBetween(clue, language) {
    const wording = ordinalWording(language, clue.ordinalCat);
    return `${subjectReference(clue.targetCat, clue.targetVal, language)} ${wording.after} ${relationReference(wording.after, clue.lowerCat, clue.lowerVal, language)}, aber ${wording.before} ${relationReference(wording.before, clue.upperCat, clue.upperVal, language)}.`;
}
function renderAdjacency(clue, language) {
    const wording = ordinalWording(language, clue.ordinalCat);
    return `${subjectReference(clue.item1Cat, clue.item1Val, language)} ${wording.adjacent} ${relationReference(wording.adjacent, clue.item2Cat, clue.item2Val, language)}.`;
}
function offsetReference(category, anchor, offset, language) {
    const direction = offset < 0 ? 'vor' : 'nach';
    const distance = Math.abs(offset) === 1 ? 'unmittelbar ' : `${Math.abs(offset)} Plätze `;
    return `die Person ${distance}${direction} ${anchor.replace(/^die Person\b/, 'der Person')} in der ${ordinalWording(language, category).label}`;
}
function renderCrossOrdinal(clue, language) {
    const first = offsetReference(clue.ordinal1, reference(clue.item1Cat, clue.item1Val, language), clue.offset1, language);
    const second = offsetReference(clue.ordinal2, reference(clue.item2Cat, clue.item2Val, language), clue.offset2, language);
    const relation = clue.operator === types_1.CrossOrdinalOperator.MATCH ? 'ist dieselbe wie' : 'ist nicht dieselbe wie';
    return `${sentenceSubject(first)} ${relation} ${second}.`;
}
function renderArithmetic(clue, language) {
    const label = ordinalWording(language, clue.ordinalCat).label;
    return `Der Abstand in der ${label} zwischen ${reference(clue.item1Cat, clue.item1Val, language)} und ${reference(clue.item2Cat, clue.item2Val, language)} ist genauso groß wie zwischen ${reference(clue.item3Cat, clue.item3Val, language)} und ${reference(clue.item4Cat, clue.item4Val, language)}.`;
}
function formatClueGerman(clue, language = DEFAULT_LANGUAGE) {
    switch (clue.type) {
        case types_1.ClueType.BINARY: return renderBinary(clue, language);
        case types_1.ClueType.ORDINAL: return renderOrdinal(clue, language);
        case types_1.ClueType.SUPERLATIVE: return renderSuperlative(clue, language);
        case types_1.ClueType.UNARY: return renderUnary(clue, language);
        case types_1.ClueType.BETWEEN: return renderBetween(clue, language);
        case types_1.ClueType.ADJACENCY: return renderAdjacency(clue, language);
        case types_1.ClueType.CROSS_ORDINAL: return renderCrossOrdinal(clue, language);
        case types_1.ClueType.ARITHMETIC: return renderArithmetic(clue, language);
        case types_1.ClueType.OR: {
            const disjunction = clue;
            return `Mindestens eine Aussage stimmt (möglicherweise beide): ${formatClueGerman(disjunction.clue1, language)} ${formatClueGerman(disjunction.clue2, language)}`;
        }
    }
    const exhaustive = clue;
    throw new Error(`Nicht unterstützter Hinweistyp: ${exhaustive.type}`);
}
