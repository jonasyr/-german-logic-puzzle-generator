import * as api from '../src';
import {
    BinaryOperator,
    ClueType,
    CrossOrdinalOperator,
    OrdinalOperator,
    SuperlativeOperator,
    UnaryFilter,
} from '../src';

describe('German booklet support', () => {
    test('exports a German clue formatter', () => {
        const formatClueGerman = (api as unknown as { formatClueGerman?: unknown }).formatClueGerman;

        expect(typeof formatClueGerman).toBe('function');
    });

    test('exports the ten-puzzle German booklet generator', () => {
        const generateGermanLogicBooklet = (api as unknown as {
            generateGermanLogicBooklet?: unknown;
        }).generateGermanLogicBooklet;

        expect(typeof generateGermanLogicBooklet).toBe('function');
    });

    test('generates ten verified hard 5x5 puzzles with reproducible seeds', () => {
        const generateGermanLogicBooklet = (api as unknown as {
            generateGermanLogicBooklet: () => {
                puzzles: Array<{
                    seed: number;
                    categories: Array<{ values: unknown[] }>;
                    clues: string[];
                    clueTypes: number[];
                    complexClueCount: number;
                    solutionRows: Array<Record<string, unknown>>;
                    verification: { fullGridSolved: boolean };
                }>;
            };
        }).generateGermanLogicBooklet;

        const booklet = generateGermanLogicBooklet();

        expect(booklet.puzzles).toHaveLength(10);
        expect(booklet.puzzles.map(puzzle => puzzle.seed)).toEqual([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
        for (const puzzle of booklet.puzzles) {
            expect(puzzle.categories).toHaveLength(5);
            expect(puzzle.categories.every(category => category.values.length === 5)).toBe(true);
            expect(puzzle.clues.length).toBeGreaterThanOrEqual(10);
            expect(new Set(puzzle.clueTypes).size).toBeGreaterThanOrEqual(3);
            expect(puzzle.complexClueCount).toBeGreaterThanOrEqual(3);
            expect(puzzle.solutionRows).toHaveLength(5);
            expect(puzzle.verification.fullGridSolved).toBe(true);
        }
        const allClues = booklet.puzzles.flatMap(puzzle => puzzle.clues).join('\n');
        expect(allClues).not.toMatch(/\b(?:nach|vor|unter|über) die Person\b/);
        expect(allClues).not.toMatch(/\bnicht eine (?:höhere|niedrigere)\b/);
        expect(allClues).not.toMatch(/\b(?:24|25):00 Uhr\b/);
    }, 30_000);

    test('renders a negative binary clue in idiomatic German', () => {
        const formatClueGerman = (api as unknown as {
            formatClueGerman: (clue: unknown) => string;
        }).formatClueGerman;

        const rendered = formatClueGerman({
            type: ClueType.BINARY,
            operator: BinaryOperator.IS_NOT,
            cat1: 'Person',
            val1: 'Anna',
            cat2: 'Getraenk',
            val2: 'Kaffee',
        });

        expect(rendered).toBe('Anna trinkt keinen Kaffee.');
    });

    test.each([
        [
            'ordinal comparison',
            {
                type: ClueType.ORDINAL,
                operator: OrdinalOperator.GREATER_THAN,
                item1Cat: 'Getraenk', item1Val: 'Kaffee',
                item2Cat: 'Person', item2Val: 'Anna',
                ordinalCat: 'Startzeit',
            },
            'Die Person, die Kaffee trinkt, startet später als Anna.',
        ],
        [
            'negated ordinal comparison',
            {
                type: ClueType.ORDINAL,
                operator: OrdinalOperator.NOT_GREATER_THAN,
                item1Cat: 'Person', item1Val: 'Anna',
                item2Cat: 'Getraenk', item2Val: 'Tee',
                ordinalCat: 'Startzeit',
            },
            'Anna startet nicht später als die Person, die Tee trinkt.',
        ],
        [
            'superlative',
            {
                type: ClueType.SUPERLATIVE,
                operator: SuperlativeOperator.MIN,
                targetCat: 'Person', targetVal: 'Anna', ordinalCat: 'Startzeit',
            },
            'Anna startet als Erste.',
        ],
        [
            'unary parity',
            {
                type: ClueType.UNARY,
                filter: UnaryFilter.IS_EVEN,
                targetCat: 'Person', targetVal: 'Anna', ordinalCat: 'Startzeit',
            },
            'Anna hat eine gerade Startzeit.',
        ],
        [
            'between',
            {
                type: ClueType.BETWEEN,
                targetCat: 'Person', targetVal: 'Anna',
                lowerCat: 'Person', lowerVal: 'Bob',
                upperCat: 'Person', upperVal: 'Carla',
                ordinalCat: 'Startzeit',
            },
            'Anna startet nach Bob, aber vor Carla.',
        ],
        [
            'adjacency',
            {
                type: ClueType.ADJACENCY,
                item1Cat: 'Person', item1Val: 'Anna',
                item2Cat: 'Person', item2Val: 'Bob', ordinalCat: 'Startzeit',
            },
            'Anna startet unmittelbar vor oder nach Bob.',
        ],
        [
            'cross ordinal match',
            {
                type: ClueType.CROSS_ORDINAL,
                operator: CrossOrdinalOperator.MATCH,
                item1Cat: 'Person', item1Val: 'Anna', ordinal1: 'Startzeit', offset1: 1,
                item2Cat: 'Person', item2Val: 'Bob', ordinal2: 'Punktzahl', offset2: -1,
            },
            'Die Person unmittelbar nach Anna in der Startzeit ist dieselbe wie die Person unmittelbar vor Bob in der Punktzahl.',
        ],
        [
            'arithmetic distance',
            {
                type: ClueType.ARITHMETIC,
                item1Cat: 'Person', item1Val: 'Anna', item2Cat: 'Person', item2Val: 'Bob',
                item3Cat: 'Person', item3Val: 'Carla', item4Cat: 'Person', item4Val: 'David',
                ordinalCat: 'Startzeit',
            },
            'Der Abstand in der Startzeit zwischen Anna und Bob ist genauso groß wie zwischen Carla und David.',
        ],
    ])('renders %s', (_label, clue, expected) => {
        const formatter = (api as unknown as { formatClueGerman: (clue: unknown) => string }).formatClueGerman;

        expect(formatter(clue)).toBe(expected);
    });

    test('renders inclusive disjunction without implying exclusive either-or', () => {
        const formatter = (api as unknown as { formatClueGerman: (clue: unknown) => string }).formatClueGerman;
        const rendered = formatter({
            type: ClueType.OR,
            clue1: { type: ClueType.BINARY, operator: BinaryOperator.IS, cat1: 'Person', val1: 'Anna', cat2: 'Getraenk', val2: 'Kaffee' },
            clue2: { type: ClueType.BINARY, operator: BinaryOperator.IS, cat1: 'Person', val1: 'Bob', cat2: 'Getraenk', val2: 'Tee' },
        });

        expect(rendered).toBe('Mindestens eine Aussage stimmt (möglicherweise beide): Anna trinkt Kaffee. Bob trinkt Tee.');
    });

    test('uses dative references after positional prepositions', () => {
        const formatter = (api as unknown as { formatClueGerman: (clue: unknown) => string }).formatClueGerman;
        const rendered = formatter({
            type: ClueType.BETWEEN,
            targetCat: 'Person', targetVal: 'Anna',
            lowerCat: 'Getraenk', lowerVal: 'Kaffee',
            upperCat: 'Getraenk', upperVal: 'Tee',
            ordinalCat: 'Startzeit',
        });

        expect(rendered).toBe('Anna startet nach der Person, die Kaffee trinkt, aber vor der Person, die Tee trinkt.');
    });

    test('uses theme-specific category and ordinal wording', () => {
        const formatter = (api as unknown as {
            formatClueGerman: (clue: unknown, language: unknown) => string;
        }).formatClueGerman;
        const language = {
            baseCategoryId: 'Person',
            categories: {
                Person: { label: 'Person', reference: '{value}' },
                Album: { label: 'Album', reference: 'die Person mit dem Album „{value}“' },
                Preis: { label: 'Preis', reference: 'die Person mit {value} Euro' },
            },
            ordinals: {
                Preis: {
                    label: 'Preis', greater: 'zahlte mehr als', less: 'zahlte weniger als',
                    notGreater: 'zahlte nicht mehr als', notLess: 'zahlte nicht weniger als',
                    minimum: 'zahlte am wenigsten', maximum: 'zahlte am meisten',
                    notMinimum: 'zahlte nicht am wenigsten', notMaximum: 'zahlte nicht am meisten',
                    after: 'zahlte mehr als', before: 'zahlte weniger als',
                    adjacent: 'zahlte den unmittelbar nächsthöheren oder nächstniedrigeren Preis als',
                    parityNoun: 'Preis',
                },
            },
        };

        const rendered = formatter({
            type: ClueType.ORDINAL,
            operator: OrdinalOperator.GREATER_THAN,
            item1Cat: 'Album', item1Val: 'Blau',
            item2Cat: 'Person', item2Val: 'Anna',
            ordinalCat: 'Preis',
        }, language);

        expect(rendered).toBe('Die Person mit dem Album „Blau“ zahlte mehr als Anna.');
    });
});
