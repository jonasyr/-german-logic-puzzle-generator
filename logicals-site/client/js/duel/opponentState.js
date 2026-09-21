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

/**
 * Ob die Auswertung fertig ist — und was darunter steht.
 *
 * Zwei Ergebnisse sind der Normalfall. Es gibt aber einen zweiten: der
 * Gegner gibt auf, der Worker schließt den Raum, und es bleibt genau ein
 * Ergebnis übrig. Rechnete man weiter nur Länge gegen zwei, drehte sich
 * beim Sieger ewig „Warte auf das andere Gerät …" — er hätte gewonnen und
 * sähe bis in alle Ewigkeit einen Wartehinweis.
 *
 * Getrennt vom Zeichnen, damit die Entscheidung ohne DOM prüfbar bleibt.
 *
 * Wer aufgegeben hat, wird beim Namen genannt: sein Mitgliedseintrag steht
 * im Raum, und „Bea hat aufgegeben" sagt dasselbe wie „das andere Gerät",
 * nur über einen Menschen statt über Hardware.
 *
 * @param {{ state?: string, results?: Array<{ playerId: number }>,
 *           members?: Array<{ playerId: number, displayName: string }> }} room
 * @param {number} playerId
 * @returns {{ complete: boolean, hint: string }}
 */
export function duelResultState(room, playerId) {
    const results = room?.results ?? [];
    const mineStored = results.some(result => result.playerId === playerId);
    if (results.length === 2) {
        return { complete: true, hint: 'Beide Ergebnisse sind gespeichert.' };
    }
    if (mineStored && room?.state === 'complete') {
        const gegner = (room.members ?? []).find(member => member.playerId !== playerId);
        return {
            complete: true,
            hint: gegner
                ? `${gegner.displayName} hat aufgegeben.`
                : 'Der Gegner hat aufgegeben.',
        };
    }
    return {
        complete: false,
        hint: mineStored
            ? 'Dein Ergebnis ist gespeichert. Warte auf das andere Gerät …'
            : 'Dein Ergebnis wird übertragen. Die Auswertung erscheint danach automatisch …',
    };
}
