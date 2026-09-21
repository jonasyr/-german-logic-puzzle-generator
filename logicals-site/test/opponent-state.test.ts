import { describe, expect, it } from 'vitest';
import { opponentFinish } from '../client/js/duel/opponentState.js';

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
