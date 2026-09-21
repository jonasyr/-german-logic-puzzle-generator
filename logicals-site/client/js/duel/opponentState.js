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
 *           members?: Array<{ playerId: number, displayName: string,
 *                            filled?: number|null }> }} room
 * @param {number} playerId
 * `forfeitedBy` trägt den Aufgebenden samt seinem letzten gemeldeten
 * Feldstand, damit die Auswertung ihn als eigene Kachel zeigen kann statt
 * ihn wegzulassen — ein Duell mit einer einzigen Kachel sähe aus, als hätte
 * der andere nie mitgespielt.
 *
 * Bewusst eine Zahl und kein Prozentsatz: gemeldet wird `marks.size`, also
 * die von Hand gesetzten Markierungen. Automatische Kreuze zählen nicht mit,
 * ein fertig gelöstes Gitter erreicht damit nie 100 %. Ein Anteil an einer
 * Gesamtzahl, die niemand je erreicht, wäre eine erfundene Genauigkeit —
 * „34 Felder gesetzt" ist dieselbe Auskunft, die während des Rennens lief.
 *
 * @returns {{ complete: boolean, hint: string,
 *             forfeitedBy: { displayName: string, filled: number|null } | null }}
 */
export function duelResultState(room, playerId) {
    const results = room?.results ?? [];
    const mineStored = results.some(result => result.playerId === playerId);
    if (results.length === 2) {
        return { complete: true, hint: 'Beide Ergebnisse sind gespeichert.', forfeitedBy: null };
    }
    if (mineStored && room?.state === 'complete') {
        const gegner = (room.members ?? []).find(member => member.playerId !== playerId);
        return {
            complete: true,
            /*
             * Nicht noch einmal „X hat aufgegeben": das steht seit der
             * eigenen Kachel schon da. Die Zeile sagt stattdessen, was fuer
             * den Raum gilt - dieselbe Rolle wie „Beide Ergebnisse sind
             * gespeichert".
             */
            hint: 'Das Duell ist beendet.',
            forfeitedBy: gegner
                ? { displayName: gegner.displayName, filled: gegner.filled ?? null }
                : null,
        };
    }
    return {
        complete: false,
        forfeitedBy: null,
        hint: mineStored
            ? 'Dein Ergebnis ist gespeichert. Warte auf das andere Gerät …'
            : 'Dein Ergebnis wird übertragen. Die Auswertung erscheint danach automatisch …',
    };
}

/**
 * Was auf der Kachel eines Aufgebenden steht.
 *
 * Ohne gemeldeten Stand bleibt die Zeile weg statt „0 Felder" zu behaupten:
 * der Melder schickt erst nach fünf Sekunden, wer vorher aussteigt, hat
 * nichts gemeldet — und „nichts gemeldet" ist nicht „nichts getan".
 *
 * @param {number|null|undefined} filled
 * @returns {string}
 */
export function forfeitScore(filled) {
    if (filled === null || filled === undefined) return 'Ohne Ergebnis';
    if (filled === 0) return 'Kein Feld gesetzt';
    return `${filled} ${filled === 1 ? 'Feld' : 'Felder'} gesetzt`;
}
