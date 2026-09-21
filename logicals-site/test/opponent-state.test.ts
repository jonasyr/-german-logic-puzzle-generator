import { describe, expect, it } from 'vitest';
import { duelResultState, opponentFinish } from '../client/js/duel/opponentState.js';
import { soloContinuation } from '../client/js/play/playState.js';

/*
 * Wer noch spielt, erfuhr nicht, dass der andere fertig ist - der Bildschirm
 * blieb unveraendert, und man spielte weiter, ohne zu wissen, dass das Rennen
 * entschieden war. An Aufnahmen belegt: shots/duell-04-gast-spielt-noch.
 *
 * Erkennbar ist es ohne Schemaaenderung: die Raum-Antwort traegt bereits
 * `results`, und ein Eintrag mit fremder Spielernummer heisst, dass dort
 * jemand abgegeben hat. Eine eigene Spalte waere eine Migration fuer eine
 * Auskunft, die schon dasteht.
 *
 * Ohne DOM, damit Vitest sie in Node pruefen kann.
 */

type Ergebnis = { playerId: number; displayName: string; elapsedMs: number; failedChecks: number };
const raum = (results: Ergebnis[]) => ({ results });

describe('Gegner fertig', () => {
    it('meldet den Gegner, sobald sein Ergebnis da ist', () => {
        const treffer = opponentFinish(
            raum([{ playerId: 2, displayName: 'Bea', elapsedMs: 61_000, failedChecks: 0 }]), 1);
        expect(treffer).toEqual({ displayName: 'Bea', elapsedMs: 61_000 });
    });

    it('schweigt, solange nur das eigene Ergebnis da ist', () => {
        expect(opponentFinish(
            raum([{ playerId: 1, displayName: 'Ada', elapsedMs: 50_000, failedChecks: 1 }]), 1),
        ).toBeNull();
    });

    it('findet den Gegner auch, wenn das eigene Ergebnis zuerst steht', () => {
        const treffer = opponentFinish(raum([
            { playerId: 1, displayName: 'Ada', elapsedMs: 50_000, failedChecks: 1 },
            { playerId: 2, displayName: 'Bea', elapsedMs: 61_000, failedChecks: 0 },
        ]), 1);
        expect(treffer?.displayName).toBe('Bea');
    });

    it('schweigt ohne Ergebnisse und ohne Raum', () => {
        expect(opponentFinish(raum([]), 1)).toBeNull();
        expect(opponentFinish({}, 1)).toBeNull();
        expect(opponentFinish(undefined, 1)).toBeNull();
    });
});

/*
 * Beim Aufgeben muss der Zwischenstand mitkommen.
 *
 * Der Speicherschluessel traegt Modus UND Raumnummer:
 *   logicals:play:${mode}:${room}:${player}:...
 * Ein Duell speichert also unter "duel:<raum>", ein fortgesetztes Einzelspiel
 * sucht unter "solo:none". Ohne Umkopieren faende der Spieler beim
 * Weiterspielen ein leeres Gitter - die Markierungen laegen noch da, nur unter
 * einem Schluessel, den niemand mehr liest.
 */
describe('Stand vom Duell ins Einzelspiel', () => {
    it('behaelt Markierungen, Zeit und Fehlpruefungen', () => {
        const duell = {
            marks: [['0.1.0.0', 'yes']], auto: [], usedClues: [],
            elapsedMs: 61_000, solved: false, attemptKey: 'duell-abc',
            failedChecks: 2, resultQueued: false,
        };
        const solo = soloContinuation(duell);
        expect(solo.marks).toEqual(duell.marks);
        expect(solo.elapsedMs).toBe(61_000);
        expect(solo.failedChecks).toBe(2);
    });

    it('wirft den Versuchsschluessel des Duells weg', () => {
        /*
         * Er dient der Entdoppelung beim Absenden. Behielte ihn das
         * Einzelspiel, koennte sein Ergebnis mit dem Duell-Ergebnis
         * kollidieren, das denselben Schluessel traegt.
         */
        const solo = soloContinuation({
            marks: [], auto: [], usedClues: [], elapsedMs: 0, solved: false,
            attemptKey: 'duell-abc', failedChecks: 0, resultQueued: true,
        });
        expect(solo.attemptKey).toBeNull();
        expect(solo.resultQueued).toBe(false);
    });
});

/*
 * Der Sieger blieb im Wartehinweis stehen.
 *
 * Gibt der Gegner auf, schliesst der Worker den Raum mit genau einem
 * Ergebnis. Die Auswertung rechnete aber Laenge gegen zwei, sah "nicht
 * fertig" - und der Sieger las auf Dauer "Warte auf das andere Geraet ...",
 * waehrend der Poll laengst gestoppt hatte.
 */
describe('Auswertung fertig', () => {
    const ada = { playerId: 1 };
    const bea = { playerId: 2 };

    it('ist fertig, sobald beide Ergebnisse da sind', () => {
        const stand = duelResultState({ state: 'complete', results: [ada, bea] }, 1);
        expect(stand.complete).toBe(true);
        expect(stand.hint).toBe('Beide Ergebnisse sind gespeichert.');
    });

    it('ist fertig, wenn der Gegner aufgegeben hat - und nennt ihn beim Namen', () => {
        const stand = duelResultState({
            state: 'complete', results: [ada],
            members: [{ playerId: 1, displayName: 'Ada' }, { playerId: 2, displayName: 'Bea' }],
        }, 1);
        expect(stand.complete).toBe(true);
        expect(stand.hint).toBe('Bea hat aufgegeben.');
    });

    it('kommt auch ohne Mitgliederliste aus', () => {
        expect(duelResultState({ state: 'complete', results: [ada] }, 1).hint)
            .toBe('Der Gegner hat aufgegeben.');
    });

    it('wartet weiter, solange der Raum laeuft', () => {
        expect(duelResultState({ state: 'active', results: [ada] }, 1).complete).toBe(false);
    });

    it('wartet auf das eigene Ergebnis, auch wenn der Raum schon zu ist', () => {
        /*
         * Der Gegner kann aufgeben, bevor die eigene Uebertragung durch ist.
         * "Fertig" ohne eigenes Ergebnis zeigte eine leere Auswertung.
         */
        const stand = duelResultState({ state: 'complete', results: [] }, 1);
        expect(stand.complete).toBe(false);
        expect(stand.hint).toContain('wird übertragen');
    });
});
