/**
 * One puzzle per day, derived rather than stored.
 *
 * Everything here is a pure function of a date, so the same day yields the same
 * puzzle on every device without a table, an endpoint or a round trip - and
 * whether somebody has played it is decided by matching results that already
 * exist against the seed their own completion date implies.
 */

import { fnv1a } from '../util/hash.js';

/** Fixed, so that two people's times measure the same work. */
export const DAILY_CATEGORIES = 5;
export const DAILY_VALUES = 5;

/**
 * Indexed by Date#getUTCDay: 0 is Sunday.
 *
 * The crossword convention - gentler early in the week, hardest at the weekend
 * when there is time for it. Printed on the button, so it is never a surprise,
 * and weekly, so it is learnable.
 */
const DIFFICULTY_BY_WEEKDAY = [
    'schwer',  // Sunday
    'leicht',  // Monday
    'leicht',
    'leicht',
    'mittel',  // Thursday
    'mittel',
    'schwer',  // Saturday
];

const BERLIN_DATE = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric', month: '2-digit', day: '2-digit',
});

/**
 * The calendar date in Germany, whatever the device's clock is set to.
 *
 * Comparability is the whole point of a daily puzzle: two friends must not get
 * different puzzles because one of them is travelling. `en-CA` is the shortest
 * route to an ISO-shaped date from Intl.
 */
export function berlinDate(when = new Date()) {
    return BERLIN_DATE.format(when);
}

export function dailySeed(date) {
    return fnv1a(date);
}

export function dailyDifficulty(date) {
    // Noon UTC, so neither end of a daylight-saving shift can move the weekday.
    const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
    return DIFFICULTY_BY_WEEKDAY[weekday];
}

/** What the generator is asked for on a given day. */
export function dailyOptions(date) {
    return {
        puzzleCount: 1,
        categoryCount: DAILY_CATEGORIES,
        valuesPerCategory: DAILY_VALUES,
        difficulty: dailyDifficulty(date),
        targetCategoryIndex: 1,
        themeId: 'standard',
        seed: dailySeed(date),
    };
}

/**
 * Whether a stored result is one of the daily puzzles.
 *
 * Seed AND shape: a custom 4x5 puzzle that happened to be generated with the
 * day's seed number is not the puzzle everybody else played, and must not count
 * towards a streak.
 */
export function isDailyResult(result) {
    if (!result?.completedAt) return false;
    const date = berlinDate(new Date(result.completedAt));
    if (result.seed !== dailySeed(date)) return false;
    const configuration = result.configuration ?? {};
    // A row without a configuration is judged on its seed alone rather than
    // discarded; the shape check is a guard, not a requirement.
    if (configuration.categoryCount === undefined) return true;
    return configuration.categoryCount === DAILY_CATEGORIES
        && configuration.valuesPerCategory === DAILY_VALUES;
}

function previousDay(date) {
    const moment = new Date(`${date}T12:00:00Z`);
    moment.setUTCDate(moment.getUTCDate() - 1);
    return moment.toISOString().slice(0, 10);
}

/**
 * Consecutive days ending today.
 *
 * Today being unplayed does not break a streak - it is not over yet - so the
 * walk starts at yesterday when today is missing. Days are counted, not
 * results, so replaying a daily changes nothing.
 */
export function dailyStreak(results, today) {
    const days = new Set();
    for (const result of results) {
        if (isDailyResult(result)) days.add(berlinDate(new Date(result.completedAt)));
    }

    let day = days.has(today) ? today : previousDay(today);
    let streak = 0;
    while (days.has(day)) {
        streak++;
        day = previousDay(day);
    }
    return streak;
}
