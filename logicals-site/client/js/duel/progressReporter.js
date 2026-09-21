/**
 * Reports how many cells this player has filled, and polls for the opponent's.
 *
 * Its own loop, because the lobby's polling is deliberately stopped the moment
 * play begins - `startGame` calls `stopLobby` - so there is otherwise no room
 * traffic at all during a duel.
 *
 * Five seconds each way, and a report only goes out when the count actually
 * changed. A duel runs for minutes; a faster rate buys nothing and costs the
 * free tier. Only a COUNT is ever sent: which cells would hand over deductions,
 * how many is just tension.
 */

import { getDuelRoom, reportDuelProgress } from './roomApi.js';

const INTERVAL_MS = 5000;

export function createProgressReporter({ room, player, onOpponent, onRoom }) {
    let lastReported = -1;
    let pending = 0;
    let timer = null;
    let stopped = false;

    async function tick() {
        if (stopped) return;
        try {
            if (pending !== lastReported) {
                await reportDuelProgress(room.code, {
                    playerId: player.id, memberToken: room.memberToken, filled: pending,
                });
                lastReported = pending;
            }
            const response = await getDuelRoom(room.code);
            const opponent = response.room.members.find(member => member.playerId !== player.id);
            if (opponent && !stopped) onOpponent(opponent);
            /*
             * Und der ganze Raum obendrein: "fertig" steht nicht in den
             * Mitgliedsangaben, sondern in response.room.results. Optional,
             * damit bestehende Aufrufer unveraendert bleiben.
             */
            if (!stopped) onRoom?.(response.room);
        } catch {
            // A duel must not fall over because the room is briefly unreachable.
            // The next tick tries again, and the count it sends is the current
            // one rather than the one that failed.
        }
        if (!stopped) timer = setTimeout(tick, INTERVAL_MS);
    }

    timer = setTimeout(tick, INTERVAL_MS);

    return {
        report(filled) { pending = filled; },
        stop() { stopped = true; clearTimeout(timer); },
    };
}
