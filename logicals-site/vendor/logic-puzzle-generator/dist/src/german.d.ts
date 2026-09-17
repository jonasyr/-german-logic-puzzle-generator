import { Clue } from './engine/Clue';
import { ValueLabel } from './types';
export interface GermanCategoryWording {
    label: string;
    reference: string;
    subjectComma?: boolean;
    predicate?: string;
    negativePredicate?: string;
    formatValue?: (value: ValueLabel) => string;
}
export interface GermanOrdinalWording {
    label: string;
    greater: string;
    less: string;
    notGreater: string;
    notLess: string;
    minimum: string;
    maximum: string;
    notMinimum: string;
    notMaximum: string;
    after: string;
    before: string;
    adjacent: string;
    parityNoun: string;
}
export interface GermanClueLanguage {
    baseCategoryId: string;
    categories: Record<string, GermanCategoryWording>;
    ordinals: Record<string, GermanOrdinalWording>;
}
export declare function formatClueGerman(clue: Clue, language?: GermanClueLanguage): string;
