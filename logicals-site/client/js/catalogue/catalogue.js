/**
 * Reine Lesefunktionen über dem Katalog. Kein DOM, kein Netz.
 *
 * Der Katalog selbst ist eine eingecheckte Datei aus fünf Zahlen je Eintrag -
 * die Determinismus-Garantie des Generators macht die Bibliothek zu einer
 * Liste statt zu einem Speicher. Die Rechnerei darüber ist Logik und gehört
 * deshalb dorthin, wo sie ohne Browser prüfbar ist.
 */

import data from './catalogue.json' with { type: 'json' };

export const CATALOGUE_SEED_FLOOR = 1_000_000;

/**
 * Kurzform der Hinweisarten, in der Reihenfolge des ClueType-Enums des
 * Generators: BINARY, ORDINAL, SUPERLATIVE, UNARY, CROSS_ORDINAL, BETWEEN,
 * ADJACENCY, OR, ARITHMETIC.
 */
const CLUE_TYPE_NAMES = [
    'A ist B',
    'A liegt vor B',
    'A ist die äußerste',
    'A hat eine Eigenschaft',
    'zwei Skalen im Verhältnis',
    'A liegt zwischen B und C',
    'A und B sind benachbart',
    'mindestens eines von beiden',
    'gleiche Differenz',
];

export function chapters() {
    return data.chapters;
}

export function chapterFor(themeId) {
    return data.chapters.find(chapter => chapter.themeId === themeId) ?? null;
}

export function progressOf(chapter, solved) {
    return {
        solved: chapter.entries.filter(entry => solved.has(entry.seed)).length,
        total: chapter.entries.length,
    };
}

export function totalProgress(solved) {
    return data.chapters.reduce((sum, chapter) => {
        const part = progressOf(chapter, solved);
        return { solved: sum.solved + part.solved, total: sum.total + part.total };
    }, { solved: 0, total: 0 });
}

/**
 * Der erste offene Eintrag - nicht der nach dem letzten gelösten.
 *
 * Springen ist erlaubt, also können Lücken hinter gelösten Einträgen liegen.
 * Der Vorschlag soll die Lücke schließen statt ans Ende zu zeigen.
 */
export function nextOpen(chapter, solved) {
    return chapter.entries.find(entry => !solved.has(entry.seed)) ?? null;
}

export function optionsFor(chapter, entry) {
    return {
        puzzleCount: 1,
        categoryCount: entry.categoryCount,
        valuesPerCategory: entry.valuesPerCategory,
        themeId: chapter.themeId,
        difficulty: entry.difficulty,
        targetCategoryIndex: 1,
        seed: entry.seed,
    };
}

/**
 * Die Hinweisart, die an dieser Stelle zum ersten Mal auftaucht - oder nichts.
 *
 * Das ist der Trainingsanteil der Sammlung, und er kostet nichts: welche Arten
 * vorkommen, entscheidet ohnehin die Schwierigkeitsstufe. Die App sagt es nur
 * endlich laut, statt es im aria-label zu verstecken, wie es die Werkzeuge
 * jahrelang taten.
 *
 * Was schon der erste Eintrag mitbringt, gilt nicht als neu: das wäre keine
 * Auskunft, sondern Lärm auf jeder Zeile.
 */
/**
 * Der Eintrag, der auf diesen Seed folgt - im selben Kapitel.
 *
 * Damit der Gelöst-Dialog "Nächstes Rätsel" anbieten kann, ohne dass das
 * Spiel sich merken muss, woher es kam: der Seed steht ohnehin in seinen
 * Optionen, und der Katalog weiß den Rest.
 *
 * Am Kapitelende bewusst `null` statt des ersten Eintrags im nächsten Kapitel.
 * Ein Kapitel zu beenden ist ein Moment; ihn zu überspringen, indem man
 * stillschweigend im nächsten landet, nähme ihn weg.
 *
 * @param {number | undefined} seed
 * @returns {{ chapter: { themeId: string, title: string },
 *             entry: { number: number, seed: number } } | null}
 */
export function entryAfter(seed) {
    if (!Number.isFinite(seed) || seed < CATALOGUE_SEED_FLOOR) return null;
    for (const chapter of chapters()) {
        const index = chapter.entries.findIndex(entry => entry.seed === seed);
        if (index === -1) continue;
        const entry = chapter.entries[index + 1];
        return entry ? { chapter, entry } : null;
    }
    return null;
}

export function newClueTypeAt(chapter, index) {
    if (index === 0) return null;

    const seen = new Set(chapter.entries[0].clueTypes);
    for (let position = 1; position < index; position += 1) {
        for (const type of chapter.entries[position].clueTypes) seen.add(type);
    }
    for (const type of chapter.entries[index].clueTypes) {
        if (!seen.has(type)) return CLUE_TYPE_NAMES[type] ?? null;
    }
    return null;
}
