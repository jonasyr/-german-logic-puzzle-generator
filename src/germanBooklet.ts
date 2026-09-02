import { Generator } from './engine/Generator';
import { LogicGrid } from './engine/LogicGrid';
import { Solver } from './engine/Solver';
import { formatClueGerman, GermanCategoryWording, GermanClueLanguage, GermanOrdinalWording } from './german';
import { CategoryConfig, CategoryType, ClueType, ValueLabel } from './types';

const CATEGORY_IDS = ['Person', 'KategorieB', 'KategorieC', 'KategorieD', 'Reihenfolge'] as const;
const ALLOWED_TYPES = [
    ClueType.BINARY,
    ClueType.ORDINAL,
    ClueType.SUPERLATIVE,
    ClueType.BETWEEN,
    ClueType.ADJACENCY,
    ClueType.OR,
    ClueType.ARITHMETIC,
];
const COMPLEX_TYPES = new Set([
    ClueType.ORDINAL,
    ClueType.BETWEEN,
    ClueType.ADJACENCY,
    ClueType.OR,
    ClueType.ARITHMETIC,
]);

interface ThemeCategory {
    label: string;
    values: ValueLabel[];
    wording: GermanCategoryWording;
    display?: (value: ValueLabel) => string;
}

interface GermanPuzzleTheme {
    id: string;
    title: string;
    story: string;
    categories: Record<(typeof CATEGORY_IDS)[number], ThemeCategory>;
    ordinal: GermanOrdinalWording;
}

export interface GermanBookletCategory {
    id: string;
    label: string;
    values: string[];
    ordinal: boolean;
}

export interface GermanBookletPuzzle {
    id: string;
    number: number;
    seed: number;
    title: string;
    story: string;
    instructions: string;
    categories: GermanBookletCategory[];
    clues: string[];
    clueTypes: number[];
    complexClueCount: number;
    targetQuestion: string;
    solutionRows: Array<Record<string, string>>;
    verification: {
        fullGridSolved: boolean;
        clueCount: number;
        distinctClueTypes: number;
    };
}

export interface GermanBookletColors {
    ink: string;
    accent: string;
    secondary: string;
    pale: string;
    muted: string;
    line: string;
}

export interface GermanLogicBooklet {
    title: string;
    subtitle: string;
    generatedAt: string;
    /** Palette handed to the PDF renderer. */
    colors: GermanBookletColors;
    /** The effective configuration this booklet was generated with. */
    config: ResolvedBookletConfig;
    puzzles: GermanBookletPuzzle[];
}

function category(
    label: string,
    values: ValueLabel[],
    reference: string,
    predicate?: string,
    negativePredicate?: string,
    subjectComma = false,
    display?: (value: ValueLabel) => string,
    clueDisplay?: (value: ValueLabel) => string,
): ThemeCategory {
    return {
        label,
        values,
        wording: { label, reference, predicate, negativePredicate, subjectComma, formatValue: clueDisplay },
        display,
    };
}

function negateRelation(text: string): string {
    if (text.startsWith('hat eine ')) return text.replace(/^hat eine /, 'hat keine ');
    if (text.startsWith('befindet sich ')) return text.replace(/^befindet sich /, 'befindet sich nicht ');
    if (text.startsWith('hat die ')) return text.replace(/^hat die /, 'hat nicht die ');
    return text.replace(/^([^ ]+) /, '$1 nicht ');
}

function ordinal(
    label: string,
    greater: string,
    less: string,
    minimum: string,
    maximum: string,
    after: string,
    before: string,
    adjacent: string,
): GermanOrdinalWording {
    return {
        label,
        greater,
        less,
        notGreater: negateRelation(greater),
        notLess: negateRelation(less),
        minimum,
        maximum,
        notMinimum: negateRelation(minimum),
        notMaximum: negateRelation(maximum),
        after,
        before,
        adjacent,
        parityNoun: label,
    };
}

const PEOPLE = [
    ['Anna', 'Ben', 'Clara', 'David', 'Eva'],
    ['Greta', 'Hasan', 'Ida', 'Jonas', 'Karla'],
    ['Lena', 'Milan', 'Nora', 'Oskar', 'Pia'],
    ['Ravi', 'Sofia', 'Timo', 'Ute', 'Viktor'],
    ['Wiebke', 'Xaver', 'Yara', 'Zeno', 'Amira'],
    ['Bela', 'Cem', 'Daria', 'Enno', 'Fiona'],
    ['Gina', 'Hannes', 'Ines', 'Juri', 'Kira'],
    ['Lea', 'Mats', 'Nele', 'Onur', 'Paula'],
    ['Quinn', 'Ronja', 'Sami', 'Thea', 'Uwe'],
    ['Valeska', 'Willi', 'Yasin', 'Zora', 'Alex'],
] as const;

const themes: GermanPuzzleTheme[] = [
    {
        id: 'streetfood',
        title: 'Finale beim Street-Food-Festival',
        story: 'Fünf Freunde probieren jeweils ein anderes Gericht und Getränk an einem anderen Stand. Auch ihre Ankunftszeiten unterscheiden sich.',
        categories: {
            Person: category('Person', [...PEOPLE[0]], '{value}'),
            KategorieB: category('Gericht', ['Falafel', 'Ramen', 'Tacos', 'Flammkuchen', 'Curry'], 'die Person, die {value} isst', 'isst {value}', 'isst nicht {value}', true),
            KategorieC: category('Getränk', ['Mate', 'Limonade', 'Kaffee', 'Eistee', 'Wasser'], 'die Person, die {value} trinkt', 'trinkt {value}', 'trinkt nicht {value}', true),
            KategorieD: category('Stand', ['Nord', 'Süd', 'Ost', 'West', 'Mitte'], 'die Person am Stand „{value}“', 'ist am Stand „{value}“', 'ist nicht am Stand „{value}“'),
            Reihenfolge: category('Ankunft', [17, 18, 19, 20, 21], 'die Person, die um {value}:00 Uhr ankommt', undefined, undefined, true, value => `${value}:00 Uhr`),
        },
        ordinal: ordinal('Ankunftszeit', 'kommt später an als', 'kommt früher an als', 'kommt als Erste an', 'kommt als Letzte an', 'kommt nach', 'vor', 'kommt unmittelbar vor oder nach'),
    },
    {
        id: 'nachtzug',
        title: 'Abfahrt des Nachtzugs',
        story: 'Fünf Reisende fahren zu unterschiedlichen Zielen. Jede Person sitzt in einem anderen Wagen, hat ein anderes Gepäckstück und steigt zu einer anderen Zeit ein.',
        categories: {
            Person: category('Reisende Person', [...PEOPLE[1]], '{value}'),
            KategorieB: category('Ziel', ['Basel', 'Prag', 'Wien', 'Zürich', 'Hamburg'], 'die Person mit Reiseziel {value}', 'reist nach {value}', 'reist nicht nach {value}'),
            KategorieC: category('Gepäck', ['Gitarrenkoffer', 'Rucksack', 'Reisetasche', 'Trolley', 'Holzkiste'], 'die Person mit dem Gepäckstück „{value}“', 'hat „{value}“ dabei', 'hat nicht „{value}“ dabei'),
            KategorieD: category('Wagen', ['A', 'B', 'C', 'D', 'E'], 'die Person in Wagen {value}', 'sitzt in Wagen {value}', 'sitzt nicht in Wagen {value}'),
            Reihenfolge: category('Einstieg', [19, 20, 21, 22, 23], 'die Person, die um {value}:00 Uhr einsteigt', undefined, undefined, true, value => `${value}:00 Uhr`),
        },
        ordinal: ordinal('Einstiegszeit', 'steigt später ein als', 'steigt früher ein als', 'steigt als Erste ein', 'steigt als Letzte ein', 'steigt nach', 'vor', 'steigt unmittelbar vor oder nach'),
    },
    {
        id: 'escape-room',
        title: 'Das verschlossene Archiv',
        story: 'Fünf Spielende übernehmen verschiedene Rollen, starten in unterschiedlichen Räumen und benutzen je ein Werkzeug. Ihre Lösungszeiten sind verschieden.',
        categories: {
            Person: category('Spielende Person', [...PEOPLE[2]], '{value}'),
            KategorieB: category('Rolle', ['Analyst', 'Architekt', 'Chronist', 'Kurier', 'Späher'], 'die Person in der Rolle „{value}“', 'spielt die Rolle „{value}“', 'spielt nicht die Rolle „{value}“'),
            KategorieC: category('Werkzeug', ['Kompass', 'Magnet', 'Spiegel', 'UV-Lampe', 'Zange'], 'die Person mit dem Werkzeug „{value}“', 'benutzt das Werkzeug „{value}“', 'benutzt nicht das Werkzeug „{value}“'),
            KategorieD: category('Startraum', ['Archiv', 'Labor', 'Galerie', 'Keller', 'Bibliothek'], 'die Person im Startraum „{value}“', 'beginnt im Raum „{value}“', 'beginnt nicht im Raum „{value}“'),
            Reihenfolge: category('Lösungszeit', [35, 40, 45, 50, 55], 'die Person mit {value} Minuten Lösungszeit', undefined, undefined, false, value => `${value} min`),
        },
        ordinal: ordinal('Lösungszeit', 'braucht länger als', 'braucht weniger Zeit als', 'ist am schnellsten', 'ist am langsamsten', 'braucht länger als', 'weniger Zeit als', 'liegt zeitlich unmittelbar vor oder nach'),
    },
    {
        id: 'sternwarte',
        title: 'Beobachtungsnacht in der Sternwarte',
        story: 'Fünf Gäste beobachten verschiedene Himmelsobjekte, nutzen unterschiedliche Teleskope und stehen an getrennten Plätzen. Jede Beobachtung beginnt zu einer anderen Zeit.',
        categories: {
            Person: category('Gast', [...PEOPLE[3]], '{value}'),
            KategorieB: category('Himmelsobjekt', ['Andromeda', 'Jupiter', 'Orionnebel', 'Saturn', 'Plejaden'], 'die Person, die {value} beobachtet', 'beobachtet {value}', 'beobachtet nicht {value}', true),
            KategorieC: category('Teleskop', ['Aster', 'Cosmos', 'Luna', 'Nova', 'Zenit'], 'die Person am Teleskop „{value}“', 'nutzt das Teleskop „{value}“', 'nutzt nicht das Teleskop „{value}“'),
            KategorieD: category('Standort', ['Kuppel', 'Norddeck', 'Ostterrasse', 'Südwiese', 'Westbalkon'], 'die Person am Standort „{value}“', 'steht am Standort „{value}“', 'steht nicht am Standort „{value}“'),
            Reihenfolge: category('Beginn', [21, 22, 23, 24, 25], 'die Person mit Beobachtungsbeginn {value}', undefined, undefined, false, value => `${Number(value) % 24}:00 Uhr`, value => `${Number(value) % 24}:00 Uhr`),
        },
        ordinal: ordinal('Beobachtungszeit', 'beginnt später als', 'beginnt früher als', 'beginnt als Erste', 'beginnt als Letzte', 'beginnt nach', 'vor', 'beginnt unmittelbar vor oder nach'),
    },
    {
        id: 'plattenmarkt',
        title: 'Raritäten auf dem Plattenmarkt',
        story: 'Fünf Sammler kaufen Platten aus verschiedenen Genres, mit unterschiedlichen Farben und bei verschiedenen Händlern. Niemand zahlt denselben Preis.',
        categories: {
            Person: category('Sammler', [...PEOPLE[4]], '{value}'),
            KategorieB: category('Genre', ['Ambient', 'Disco', 'Jazz', 'Punk', 'Techno'], 'die Person mit dem Genre „{value}“', 'kauft eine Platte aus dem Genre „{value}“', 'kauft keine Platte aus dem Genre „{value}“'),
            KategorieC: category('Plattenfarbe', ['Blau', 'Gelb', 'Grün', 'Rot', 'Violett'], 'die Person mit der Plattenfarbe „{value}“', 'kauft die Plattenfarbe „{value}“', 'kauft nicht die Plattenfarbe „{value}“'),
            KategorieD: category('Händler', ['Beatbox', 'Groove', 'Needle', 'Orbit', 'Waxworks'], 'die Person beim Händler „{value}“', 'kauft bei „{value}“', 'kauft nicht bei „{value}“'),
            Reihenfolge: category('Preis', [20, 30, 40, 50, 60], 'die Person mit einem Preis von {value} Euro', undefined, undefined, false, value => `${value} €`),
        },
        ordinal: ordinal('Preis', 'zahlt mehr als', 'zahlt weniger als', 'zahlt am wenigsten', 'zahlt am meisten', 'zahlt mehr als', 'weniger als', 'zahlt den unmittelbar nächsthöheren oder nächstniedrigeren Preis als'),
    },
    {
        id: 'hackathon',
        title: 'Entscheidung beim Nacht-Hackathon',
        story: 'Fünf Entwickler stellen verschiedene Projekte vor, verwenden unterschiedliche Programmiersprachen und arbeiten in getrennten Räumen. Die Jury vergibt fünf verschiedene Punktzahlen.',
        categories: {
            Person: category('Entwickler', [...PEOPLE[5]], '{value}'),
            KategorieB: category('Projekt', ['Atlas', 'Beacon', 'Cipher', 'Drift', 'Echo'], 'die Person mit dem Projekt „{value}“', 'entwickelt das Projekt „{value}“', 'entwickelt nicht das Projekt „{value}“'),
            KategorieC: category('Sprache', ['Go', 'Kotlin', 'Python', 'Rust', 'TypeScript'], 'die Person mit der Sprache „{value}“', 'programmiert in {value}', 'programmiert nicht in {value}'),
            KategorieD: category('Raum', ['Alpha', 'Beta', 'Gamma', 'Delta', 'Omega'], 'die Person im Raum „{value}“', 'arbeitet im Raum „{value}“', 'arbeitet nicht im Raum „{value}“'),
            Reihenfolge: category('Punkte', [60, 70, 80, 90, 100], 'die Person mit {value} Punkten', undefined, undefined, false, value => `${value} Punkte`),
        },
        ordinal: ordinal('Punktzahl', 'erzielt mehr Punkte als', 'erzielt weniger Punkte als', 'erzielt die wenigsten Punkte', 'erzielt die meisten Punkte', 'erzielt mehr Punkte als', 'weniger Punkte als', 'liegt in der Punktzahl unmittelbar vor oder nach'),
    },
    {
        id: 'fotowettbewerb',
        title: 'Die fünf Nachtaufnahmen',
        story: 'Fünf Fotografen reichen unterschiedliche Motive ein, nutzen verschiedene Kameras und fotografieren an verschiedenen Orten. Die Jury bewertet jedes Bild anders.',
        categories: {
            Person: category('Fotograf', [...PEOPLE[6]], '{value}'),
            KategorieB: category('Motiv', ['Blitz', 'Milchstraße', 'Mond', 'Nebel', 'Polarlicht'], 'die Person mit dem Motiv „{value}“', 'fotografiert das Motiv „{value}“', 'fotografiert nicht das Motiv „{value}“'),
            KategorieC: category('Kamera', ['Aquila', 'Lumen', 'Orion', 'Pixel', 'Vega'], 'die Person mit der Kamera „{value}“', 'nutzt die Kamera „{value}“', 'nutzt nicht die Kamera „{value}“'),
            KategorieD: category('Ort', ['Brücke', 'Feld', 'Hafen', 'Hügel', 'See'], 'die Person am Ort „{value}“', 'fotografiert am Ort „{value}“', 'fotografiert nicht am Ort „{value}“'),
            Reihenfolge: category('Punkte', [72, 78, 84, 90, 96], 'die Person mit {value} Jurypunkten', undefined, undefined, false, value => `${value} Punkte`),
        },
        ordinal: ordinal('Jurywertung', 'erhält mehr Punkte als', 'erhält weniger Punkte als', 'erhält die wenigsten Punkte', 'erhält die meisten Punkte', 'erhält mehr Punkte als', 'weniger Punkte als', 'liegt in der Wertung unmittelbar vor oder nach'),
    },
    {
        id: 'gartenfest',
        title: 'Das Rätsel vom Gartenfest',
        story: 'Fünf Gäste bringen unterschiedliche Pflanzen mit, essen verschiedene Kuchen und sitzen in getrennten Bereichen. Sie treffen nacheinander ein.',
        categories: {
            Person: category('Gast', [...PEOPLE[7]], '{value}'),
            KategorieB: category('Pflanze', ['Basilikum', 'Lavendel', 'Minze', 'Rosmarin', 'Salbei'], 'die Person mit der Pflanze „{value}“', 'bringt {value} mit', 'bringt nicht {value} mit'),
            KategorieC: category('Kuchen', ['Apfel', 'Käse', 'Mohn', 'Pflaume', 'Zitrone'], 'die Person mit dem Kuchen „{value}“', 'isst {value}kuchen', 'isst keinen {value}kuchen'),
            KategorieD: category('Sitzbereich', ['Laube', 'Teich', 'Terrasse', 'Wiese', 'Wintergarten'], 'die Person im Bereich „{value}“', 'sitzt im Bereich „{value}“', 'sitzt nicht im Bereich „{value}“'),
            Reihenfolge: category('Ankunft', [14, 15, 16, 17, 18], 'die Person, die um {value}:00 Uhr eintrifft', undefined, undefined, true, value => `${value}:00 Uhr`),
        },
        ordinal: ordinal('Ankunftszeit', 'trifft später ein als', 'trifft früher ein als', 'trifft als Erste ein', 'trifft als Letzte ein', 'trifft nach', 'vor', 'trifft unmittelbar vor oder nach'),
    },
    {
        id: 'museum',
        title: 'Spätschicht im Museum',
        story: 'Fünf Besucher sehen verschiedene Ausstellungen, verwenden unterschiedliche Audioguides und tragen verschiedenfarbige Tickets. Jede Ausstellung liegt in einem anderen Stockwerk.',
        categories: {
            Person: category('Besucher', [...PEOPLE[8]], '{value}'),
            KategorieB: category('Ausstellung', ['Antike', 'Design', 'Fotografie', 'Robotik', 'Weltraum'], 'die Person in der Ausstellung „{value}“', 'besucht die Ausstellung „{value}“', 'besucht nicht die Ausstellung „{value}“'),
            KategorieC: category('Audioguide', ['A1', 'B2', 'C3', 'D4', 'E5'], 'die Person mit Audioguide {value}', 'nutzt Audioguide {value}', 'nutzt nicht Audioguide {value}'),
            KategorieD: category('Ticketfarbe', ['Blau', 'Gelb', 'Grün', 'Orange', 'Rot'], 'die Person mit der Ticketfarbe „{value}“', 'hat die Ticketfarbe „{value}“', 'hat nicht die Ticketfarbe „{value}“'),
            Reihenfolge: category('Stockwerk', [1, 2, 3, 4, 5], 'die Person im {value}. Stock', undefined, undefined, false, value => `${value}. Stock`),
        },
        ordinal: ordinal('Stockwerk', 'befindet sich höher als', 'befindet sich tiefer als', 'befindet sich im untersten Stock', 'befindet sich im obersten Stock', 'befindet sich höher als', 'tiefer als', 'befindet sich genau ein Stockwerk über oder unter'),
    },
    {
        id: 'triathlon',
        title: 'Startliste des Staffel-Triathlons',
        story: 'Fünf Athleten starten für verschiedene Vereine, fahren Räder in unterschiedlichen Farben und haben verschiedene Getränke vorbereitet. Ihre Startnummern sind eindeutig.',
        categories: {
            Person: category('Athlet', [...PEOPLE[9]], '{value}'),
            KategorieB: category('Verein', ['Adler', 'Blitz', 'Falke', 'Welle', 'Zünder'], 'die Person vom Verein „{value}“', 'startet für den Verein „{value}“', 'startet nicht für den Verein „{value}“'),
            KategorieC: category('Radfarbe', ['Blau', 'Gelb', 'Grün', 'Rot', 'Schwarz'], 'die Person mit der Radfarbe „{value}“', 'fährt das Rad in „{value}“', 'fährt nicht das Rad in „{value}“'),
            KategorieD: category('Getränk', ['Cola', 'Iso', 'Saft', 'Tee', 'Wasser'], 'die Person mit dem Getränk „{value}“', 'hat {value} vorbereitet', 'hat nicht {value} vorbereitet'),
            Reihenfolge: category('Startnummer', [11, 22, 33, 44, 55], 'die Person mit Startnummer {value}', undefined, undefined, false, value => `Nr. ${value}`),
        },
        ordinal: ordinal('Startnummer', 'hat eine höhere Startnummer als', 'hat eine niedrigere Startnummer als', 'hat die niedrigste Startnummer', 'hat die höchste Startnummer', 'hat eine höhere Startnummer als', 'eine niedrigere Startnummer als', 'hat die unmittelbar nächsthöhere oder nächstniedrigere Startnummer als'),
    },
];

export type GermanDifficulty = 'leicht' | 'mittel' | 'schwer';

interface DifficultyProfile {
    allowedClueTypes: ClueType[];
    complexRatio: number;
    minDistinctClueTypes: number;
}

const DIFFICULTY_PROFILES: Record<GermanDifficulty, DifficultyProfile> = {
    leicht: {
        allowedClueTypes: [ClueType.BINARY, ClueType.ORDINAL, ClueType.SUPERLATIVE],
        complexRatio: 0,
        minDistinctClueTypes: 2,
    },
    mittel: {
        allowedClueTypes: [ClueType.BINARY, ClueType.ORDINAL, ClueType.SUPERLATIVE, ClueType.BETWEEN, ClueType.ADJACENCY],
        complexRatio: 0.2,
        minDistinctClueTypes: 3,
    },
    schwer: {
        allowedClueTypes: ALLOWED_TYPES,
        complexRatio: 0.3,
        minDistinctClueTypes: 3,
    },
};

export const DEFAULT_BOOKLET_COLORS: GermanBookletColors = {
    ink: '#172033',
    accent: '#C6492D',
    secondary: '#227C78',
    pale: '#F3F0EA',
    muted: '#5B6475',
    line: '#C9CDD5',
};

/** Themes are ordered; 'standard' rotates through all of them. */
export const STANDARD_THEME_ID = 'standard';

/**
 * Pinned so that identical options always produce an identical booklet, as the engine's
 * determinism guarantee requires. Callers that want a real timestamp (such as the web app)
 * pass `generatedAt` explicitly.
 */
export const DEFAULT_GENERATED_AT = '2026-09-01';

const DIFFICULTY_ADJECTIVES: Record<GermanDifficulty, string> = {
    leicht: 'leichte',
    mittel: 'mittelschwere',
    schwer: 'schwere',
};

const MIDDLE_CATEGORY_IDS = ['KategorieB', 'KategorieC', 'KategorieD'] as const;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const MAX_BUILD_ATTEMPTS = 16;
/** After this many failed attempts only the hard requirement (unique solution) is enforced. */
const RELAX_AFTER_ATTEMPTS = 10;

export const BOOKLET_LIMITS = {
    puzzleCount: { min: 1, max: themes.length },
    categoryCount: { min: 3, max: CATEGORY_IDS.length },
    valuesPerCategory: { min: 4, max: 5 },
} as const;

export interface GermanBookletOptions {
    /** Number of puzzles in the booklet (1 … 10). Default: 10. */
    puzzleCount?: number;
    /** Categories per puzzle (3 … 5), always Person + middle categories + ordinal category. Default: 5. */
    categoryCount?: number;
    /** Values (rows) per category (4 … 5). Default: 5. */
    valuesPerCategory?: number;
    /** A theme id, or 'standard' to rotate through all themes. Default: 'standard'. */
    themeId?: string;
    /** Controls allowed clue types and the quality gate. Default: 'schwer'. */
    difficulty?: GermanDifficulty;
    /** Which middle category the final question asks about (1-based). Default: 1. */
    targetCategoryIndex?: number;
    /** Base seed; puzzle N uses seed + N. Default: 100. */
    seed?: number;
    title?: string;
    subtitle?: string;
    generatedAt?: string;
    colors?: Partial<GermanBookletColors>;
}

export interface ResolvedBookletConfig {
    puzzleCount: number;
    categoryCount: number;
    valuesPerCategory: number;
    themeId: string;
    difficulty: GermanDifficulty;
    targetCategoryIndex: number;
    seed: number;
}

export interface GermanThemeSummary {
    id: string;
    title: string;
    story: string;
    categories: string[];
}

/** Lists every built-in theme, e.g. to populate a theme picker. */
export function listGermanThemes(): GermanThemeSummary[] {
    return themes.map(theme => ({
        id: theme.id,
        title: theme.title,
        story: theme.story,
        categories: CATEGORY_IDS.map(id => theme.categories[id].label),
    }));
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
    const parsed = Math.round(Number(value));
    if (!Number.isFinite(parsed)) return fallback;
    return Math.min(max, Math.max(min, parsed));
}

function resolveColors(colors?: Partial<GermanBookletColors>): GermanBookletColors {
    const resolved = { ...DEFAULT_BOOKLET_COLORS };
    for (const key of Object.keys(DEFAULT_BOOKLET_COLORS) as (keyof GermanBookletColors)[]) {
        const value = colors?.[key];
        if (typeof value === 'string' && HEX_COLOR.test(value)) {
            resolved[key] = value.toUpperCase();
        }
    }
    return resolved;
}

function resolveConfig(options: GermanBookletOptions): ResolvedBookletConfig {
    const categoryCount = clampInt(
        options.categoryCount, BOOKLET_LIMITS.categoryCount.min, BOOKLET_LIMITS.categoryCount.max, CATEGORY_IDS.length,
    );
    const difficulty: GermanDifficulty =
        options.difficulty && options.difficulty in DIFFICULTY_PROFILES ? options.difficulty : 'schwer';
    const themeId = options.themeId && themes.some(theme => theme.id === options.themeId)
        ? options.themeId
        : STANDARD_THEME_ID;

    return {
        puzzleCount: clampInt(options.puzzleCount, BOOKLET_LIMITS.puzzleCount.min, BOOKLET_LIMITS.puzzleCount.max, themes.length),
        categoryCount,
        valuesPerCategory: clampInt(
            options.valuesPerCategory, BOOKLET_LIMITS.valuesPerCategory.min, BOOKLET_LIMITS.valuesPerCategory.max, 5,
        ),
        themeId,
        difficulty,
        targetCategoryIndex: clampInt(options.targetCategoryIndex, 1, categoryCount - 2, 1),
        seed: clampInt(options.seed, 0, Number.MAX_SAFE_INTEGER, 100),
    };
}

type CategoryId = (typeof CATEGORY_IDS)[number];

/** Person + as many middle categories as requested + the ordinal category, in booklet order. */
function selectedCategoryIds(categoryCount: number): CategoryId[] {
    return ['Person', ...MIDDLE_CATEGORY_IDS.slice(0, categoryCount - 2), 'Reihenfolge'];
}

function engineCategories(theme: GermanPuzzleTheme, ids: CategoryId[], valueCount: number): CategoryConfig[] {
    return ids.map(id => ({
        id,
        type: id === 'Reihenfolge' ? CategoryType.ORDINAL : CategoryType.NOMINAL,
        values: theme.categories[id].values.slice(0, valueCount),
    }));
}

function languageFor(theme: GermanPuzzleTheme, ids: CategoryId[]): GermanClueLanguage {
    const categories = Object.fromEntries(ids.map(id => [id, theme.categories[id].wording]));
    return {
        baseCategoryId: 'Person',
        categories,
        ordinals: { Reihenfolge: theme.ordinal },
    };
}

const COUNT_WORDS: Record<number, string> = { 3: 'Drei', 4: 'Vier', 5: 'Fünf' };

/**
 * The handwritten stories describe the full 5x5 layout. For reduced configurations they would
 * name categories and participants that no longer exist, so those get a generated description
 * of the actual grid instead.
 */
function storyFor(theme: GermanPuzzleTheme, ids: CategoryId[], valueCount: number): string {
    const isFullLayout = ids.length === CATEGORY_IDS.length
        && valueCount === theme.categories.Person.values.length;
    if (isFullLayout) return theme.story;

    const labels = ids.filter(id => id !== 'Person').map(id => `„${theme.categories[id].label}“`);
    const categoryPhrase = labels.length === 1
        ? `der Kategorie ${labels[0]}`
        : `den Kategorien ${labels.slice(0, -1).join(', ')} und ${labels[labels.length - 1]}`;
    const count = COUNT_WORDS[valueCount] ?? String(valueCount);

    return `${count} Personen nehmen teil. Jede Person hat genau einen Wert aus ${categoryPhrase}`
        + ' – kein Wert kommt doppelt vor.';
}

function displayValue(theme: GermanPuzzleTheme, categoryId: CategoryId, value: ValueLabel): string {
    const formatter = theme.categories[categoryId].display;
    return formatter ? formatter(value) : String(value);
}

function buildPuzzle(
    theme: GermanPuzzleTheme,
    number: number,
    seed: number,
    config: ResolvedBookletConfig,
    relaxed: boolean,
): GermanBookletPuzzle {
    const ids = selectedCategoryIds(config.categoryCount);
    const categories = engineCategories(theme, ids, config.valuesPerCategory);
    const language = languageFor(theme, ids);
    const profile = DIFFICULTY_PROFILES[config.difficulty];
    const personValues = categories[0].values;
    const targetCategoryId = MIDDLE_CATEGORY_IDS[config.targetCategoryIndex - 1];
    const target = {
        category1Id: 'Person',
        value1: personValues[personValues.length - 1],
        category2Id: targetCategoryId,
    };
    const generated = new Generator(seed).generatePuzzle(categories, target, {
        maxCandidates: 100,
        timeoutMs: 30_000,
        constraints: { allowedClueTypes: profile.allowedClueTypes },
    });

    const replayGrid = new LogicGrid(categories);
    const solver = new Solver();
    for (const clue of generated.validClues) {
        solver.applyClue(replayGrid, clue);
    }
    const fullGridSolved = categories.every(cat1 =>
        cat1.values.every(val1 =>
            categories.every(cat2 => cat1.id === cat2.id || replayGrid.getPossibilitiesCount(cat1.id, val1, cat2.id) === 1),
        ),
    );

    const clueTypes = generated.validClues.map(clue => clue.type);
    const complexClueCount = clueTypes.filter(type => COMPLEX_TYPES.has(type)).length;
    const distinctClueTypes = new Set(clueTypes).size;

    // The quality gate scales with the grid size: a 3x4 puzzle simply needs fewer clues than a 5x5 one.
    const minClues = Math.max(4, Math.round((categories.length - 1) * config.valuesPerCategory * 0.5));
    const minComplexClues = Math.round(minClues * profile.complexRatio);

    if (!fullGridSolved) {
        throw new Error(`Seed ${seed}: Das Gitter ist nicht eindeutig lösbar.`);
    }
    if (!relaxed && (
        generated.validClues.length < minClues
        || distinctClueTypes < profile.minDistinctClueTypes
        || complexClueCount < minComplexClues
    )) {
        throw new Error(`Seed ${seed} erfüllt die Schwierigkeitskriterien nicht.`);
    }

    const solutionRows = personValues.map(person => {
        const row: Record<string, string> = {};
        for (const id of ids) {
            const rawValue = id === 'Person' ? person : generated.solution[id][String(person)];
            row[theme.categories[id].label] = displayValue(theme, id, rawValue);
        }
        return row;
    });

    return {
        id: theme.id,
        number,
        seed,
        title: theme.title,
        story: storyFor(theme, ids, config.valuesPerCategory),
        instructions: 'Ordne jeder Person genau einen Wert aus jeder Kategorie zu. Alle Hinweise sind wahr; bei Oder-Hinweisen können auch beide Teilaussagen stimmen.',
        categories: ids.map(id => ({
            id,
            label: theme.categories[id].label,
            values: theme.categories[id].values.slice(0, config.valuesPerCategory).map(value => displayValue(theme, id, value)),
            ordinal: id === 'Reihenfolge',
        })),
        clues: generated.validClues.map(clue => formatClueGerman(clue, language)),
        clueTypes,
        complexClueCount,
        targetQuestion: `Welche Zuordnung der Kategorie „${theme.categories[targetCategoryId].label}“ gehört zu ${target.value1}?`,
        solutionRows,
        verification: {
            fullGridSolved,
            clueCount: generated.validClues.length,
            distinctClueTypes,
        },
    };
}

/**
 * Builds one puzzle, retrying with derived seeds when the quality gate rejects a candidate.
 * Attempt 0 uses the requested seed, so a given configuration stays reproducible.
 */
function buildPuzzleWithRetries(
    theme: GermanPuzzleTheme,
    number: number,
    baseSeed: number,
    config: ResolvedBookletConfig,
): GermanBookletPuzzle {
    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_BUILD_ATTEMPTS; attempt++) {
        try {
            return buildPuzzle(theme, number, baseSeed + attempt * 1000, config, attempt >= RELAX_AFTER_ATTEMPTS);
        } catch (error) {
            lastError = error;
        }
    }
    throw new Error(
        `Rätsel ${number} („${theme.title}“) konnte mit dieser Konfiguration nicht erzeugt werden: `
        + `${lastError instanceof Error ? lastError.message : String(lastError)}`,
    );
}

/**
 * Generates a printable German logic-puzzle booklet.
 * Called without options it reproduces the original ten hard 5x5 puzzles (seeds 100-109).
 */
export function generateGermanLogicBooklet(options: GermanBookletOptions = {}): GermanLogicBooklet {
    const config = resolveConfig(options);
    const colors = resolveColors(options.colors);
    const selectedThemes = config.themeId === STANDARD_THEME_ID
        ? themes
        : [themes.find(theme => theme.id === config.themeId)!];

    const puzzles: GermanBookletPuzzle[] = [];
    for (let index = 0; index < config.puzzleCount; index++) {
        const theme = selectedThemes[index % selectedThemes.length];
        puzzles.push(buildPuzzleWithRetries(theme, index + 1, config.seed + index, config));
    }

    return {
        title: options.title?.trim() || 'Logik unter Hochdruck',
        subtitle: options.subtitle?.trim()
            || `${config.puzzleCount} ${DIFFICULTY_ADJECTIVES[config.difficulty]} deutsche Logicals mit vollständigen Lösungen`,
        generatedAt: options.generatedAt ?? DEFAULT_GENERATED_AT,
        colors,
        config,
        puzzles,
    };
}
