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

    // Rows arrive newest first. Split in half and compare, which is enough to
    // say "getting better" without pretending to a regression line.
    let failedChecksTrend = null;
    if (results.length >= 2) {
        const half = Math.floor(results.length / 2);
        failedChecksTrend = {
            later: mean(results.slice(0, half).map(result => result.failedChecks)),
            earlier: mean(results.slice(half).map(result => result.failedChecks)),
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

    for (const result of results) {
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
