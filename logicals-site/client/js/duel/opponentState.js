/**
 * Ob der Gegner fertig ist — und wie schnell.
 *
 * Ohne Schemaänderung erkennbar: die Raum-Antwort trägt bereits `results`,
 * und ein Eintrag mit fremder Spielernummer heißt, dass dort jemand
 * abgegeben hat. Eine eigene Spalte „finishedAt" wäre eine Migration für
 * eine Auskunft, die schon dasteht.
 *
 * Bewusst ohne DOM und ohne Netz: eine reine Funktion lässt sich in Node
 * prüfen, und die Entscheidung, ob jemand fertig ist, gehört nicht in
 * denselben Baustein wie die Frage, wie man es anzeigt.
 *
 * @param {{ results?: Array<{ playerId: number, displayName: string, elapsedMs: number }> } | undefined} room
 * @param {number} playerId
 * @returns {{ displayName: string, elapsedMs: number } | null}
 */
export function opponentFinish(room, playerId) {
    const treffer = (room?.results ?? []).find(result => result.playerId !== playerId);
    if (!treffer) return null;
    return { displayName: treffer.displayName, elapsedMs: treffer.elapsedMs };
}
