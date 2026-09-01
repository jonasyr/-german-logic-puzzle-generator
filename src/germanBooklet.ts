import { Generator } from './engine/Generator';
import { LogicGrid } from './engine/LogicGrid';
import { Solver } from './engine/Solver';
import { formatClueGerman, GermanCategoryWording, GermanClueLanguage, GermanOrdinalWording } from './german';
import { CategoryConfig, CategoryType, ClueType, ValueLabel } from './types';

const CATEGORY_IDS = ['Person', 'KategorieB', 'KategorieC', 'KategorieD', 'Reihenfolge'] as const;
const SEEDS = [100, 101, 102, 103, 104, 105, 106, 107, 108, 109] as const;
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

export interface GermanLogicBooklet {
    title: string;
    subtitle: string;
    generatedAt: string;
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

function engineCategories(theme: GermanPuzzleTheme): CategoryConfig[] {
    return CATEGORY_IDS.map(id => ({
        id,
        type: id === 'Reihenfolge' ? CategoryType.ORDINAL : CategoryType.NOMINAL,
        values: [...theme.categories[id].values],
    }));
}

function languageFor(theme: GermanPuzzleTheme): GermanClueLanguage {
    const categories = Object.fromEntries(
        CATEGORY_IDS.map(id => [id, theme.categories[id].wording]),
    );
    return {
        baseCategoryId: 'Person',
        categories,
        ordinals: { Reihenfolge: theme.ordinal },
    };
}

function displayValue(theme: GermanPuzzleTheme, categoryId: (typeof CATEGORY_IDS)[number], value: ValueLabel): string {
    const formatter = theme.categories[categoryId].display;
    return formatter ? formatter(value) : String(value);
}

function buildPuzzle(theme: GermanPuzzleTheme, number: number, seed: number): GermanBookletPuzzle {
    const categories = engineCategories(theme);
    const language = languageFor(theme);
    const target = {
        category1Id: 'Person',
        value1: categories[0].values[4],
        category2Id: 'KategorieB',
    };
    const generated = new Generator(seed).generatePuzzle(categories, target, {
        maxCandidates: 100,
        timeoutMs: 30_000,
        constraints: { allowedClueTypes: ALLOWED_TYPES },
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
    if (!fullGridSolved || generated.validClues.length < 10 || distinctClueTypes < 3 || complexClueCount < 3) {
        throw new Error(`Seed ${seed} erfüllt die Schwierigkeitskriterien nicht.`);
    }

    const solutionRows = categories[0].values.map(person => {
        const row: Record<string, string> = {};
        for (const id of CATEGORY_IDS) {
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
        story: theme.story,
        instructions: 'Ordne jeder Person genau einen Wert aus jeder Kategorie zu. Alle Hinweise sind wahr; bei Oder-Hinweisen können auch beide Teilaussagen stimmen.',
        categories: CATEGORY_IDS.map(id => ({
            id,
            label: theme.categories[id].label,
            values: theme.categories[id].values.map(value => displayValue(theme, id, value)),
            ordinal: id === 'Reihenfolge',
        })),
        clues: generated.validClues.map(clue => formatClueGerman(clue, language)),
        clueTypes,
        complexClueCount,
        targetQuestion: `Welche Zuordnung der Kategorie „${theme.categories.KategorieB.label}“ gehört zu ${target.value1}?`,
        solutionRows,
        verification: {
            fullGridSolved,
            clueCount: generated.validClues.length,
            distinctClueTypes,
        },
    };
}

export function generateGermanLogicBooklet(): GermanLogicBooklet {
    return {
        title: 'Logik unter Hochdruck',
        subtitle: '10 schwere deutsche Logicals mit vollständigen Lösungen',
        generatedAt: '2026-09-01',
        puzzles: themes.map((theme, index) => buildPuzzle(theme, index + 1, SEEDS[index])),
    };
}
