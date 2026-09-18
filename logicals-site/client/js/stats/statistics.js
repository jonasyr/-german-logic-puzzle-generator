/**
 * Everything the statistics screen shows, as pure functions over result rows.
 *
 * No DOM and no network, so the arithmetic is testable in the same node
 * environment as the rest of the suite - and the screen stays a renderer.
 */

import { dailyStreak } from '../play/dailyPuzzle.js';

const DIFFICULTY_ORDER = ['leicht', 'mittel', 'schwer'];

/**
 * The middle value, not the mean.
 *
 * One evening where somebody wandered off mid-puzzle drags a mean somewhere
 * that describes nobody's experience. The median ignores it.
 */
export function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((left, right) => left - right);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mean(values) {
    if (!values.length) return null;
    return values.reduce((total, value) => total + value, 0) / values.length;
}

/**
 * Newest first, decided here rather than assumed of the caller.
 *
 * The history endpoint does order by completed_at DESC, but the trend below
 * splits the list in half and compares the halves - so a caller that ever
 * handed these rows over sorted the other way would not fail, it would report
 * improvement as decline. Sorting costs nothing and removes the trap.
 */
function newestFirst(results) {
    return [...results].sort((left, right) =>
        Date.parse(right.completedAt) - Date.parse(left.completedAt));
}

export function personalStats(results, today) {
    const byDifficulty = DIFFICULTY_ORDER
        .map(difficulty => {
            const matching = results.filter(result => result.difficulty === difficulty);
            return {
                difficulty,
                solved: matching.length,
                medianMs: median(matching.map(result => result.elapsedMs)),
            };
        })
        .filter(entry => entry.solved > 0);

    // Split the history in half and compare, which is enough to say "getting
    // better" without pretending to a regression line.
    let failedChecksTrend = null;
    if (results.length >= 2) {
        const ordered = newestFirst(results);
        const half = Math.floor(ordered.length / 2);
        failedChecksTrend = {
            later: mean(ordered.slice(0, half).map(result => result.failedChecks)),
            earlier: mean(ordered.slice(half).map(result => result.failedChecks)),
        };
    }

    const byTime = [...results].sort((left, right) => left.elapsedMs - right.elapsedMs);
    return {
        total: results.length,
        byDifficulty,
        failedChecksTrend,
        streak: dailyStreak(results, today),
        totalMs: results.reduce((total, result) => total + result.elapsedMs, 0),
        best: byTime[0] ?? null,
        longest: byTime[byTime.length - 1] ?? null,
    };
}

export function headToHead(results) {
    const byOpponent = new Map();

    // Newest first, so the "last five" strip really is the last five.
    for (const result of newestFirst(results)) {
        // A duel the other side has not finished has nothing to compare.
        if (!result.roomId || !result.opponentName) continue;
        if (typeof result.opponentElapsedMs !== 'number') continue;

        if (!byOpponent.has(result.opponentName)) {
            byOpponent.set(result.opponentName, {
                opponent: result.opponentName,
                won: 0, lost: 0, drawn: 0,
                margins: [], byDifficulty: new Map(), recent: [],
            });
        }
        const entry = byOpponent.get(result.opponentName);
        const margin = result.opponentElapsedMs - result.elapsedMs;
        const outcome = margin > 0 ? 'won' : margin < 0 ? 'lost' : 'drawn';

        entry[outcome]++;
        entry.margins.push(margin);
        if (entry.recent.length < 5) entry.recent.push(outcome);

        const difficulty = entry.byDifficulty.get(result.difficulty) ?? { mine: [], theirs: [] };
        difficulty.mine.push(result.elapsedMs);
        difficulty.theirs.push(result.opponentElapsedMs);
        entry.byDifficulty.set(result.difficulty, difficulty);
    }

    return [...byOpponent.values()].map(entry => ({
        opponent: entry.opponent,
        won: entry.won,
        lost: entry.lost,
        drawn: entry.drawn,
        // Positive means faster than them.
        averageMarginMs: mean(entry.margins),
        fasterAt: Object.fromEntries([...entry.byDifficulty].map(([difficulty, times]) => [
            difficulty,
            median(times.mine) <= median(times.theirs) ? 'me' : 'them',
        ])),
        recent: entry.recent,
    }));
}
