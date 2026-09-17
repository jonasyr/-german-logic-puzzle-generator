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
export type GermanDifficulty = 'leicht' | 'mittel' | 'schwer';
export declare const DEFAULT_BOOKLET_COLORS: GermanBookletColors;
/** Themes are ordered; 'standard' rotates through all of them. */
export declare const STANDARD_THEME_ID = "standard";
/**
 * Pinned so that identical options always produce an identical booklet, as the engine's
 * determinism guarantee requires. Callers that want a real timestamp (such as the web app)
 * pass `generatedAt` explicitly.
 */
export declare const DEFAULT_GENERATED_AT = "2026-09-01";
export declare const BOOKLET_LIMITS: {
    readonly puzzleCount: {
        readonly min: 1;
        readonly max: number;
    };
    readonly categoryCount: {
        readonly min: 3;
        readonly max: 5;
    };
    readonly valuesPerCategory: {
        readonly min: 4;
        readonly max: 5;
    };
};
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
export declare function listGermanThemes(): GermanThemeSummary[];
/**
 * Generates a printable German logic-puzzle booklet.
 * Called without options it reproduces the original ten hard 5x5 puzzles (seeds 100-109).
 */
export declare function generateGermanLogicBooklet(options?: GermanBookletOptions): GermanLogicBooklet;
