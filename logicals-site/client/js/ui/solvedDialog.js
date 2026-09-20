/**
 * The "you solved it" moment.
 *
 * Finishing a puzzle used to change nothing but a line of status text, so the
 * one event the whole screen exists for passed unmarked - and there was no way
 * back to the start screen from a finished grid either.
 *
 * Built on the same <dialog> element as the confirmations, including the same
 * guards: <dialog> only reached Safari in 15.4, so every call checks the method
 * exists rather than assuming it.
 */

import { el } from '../dom.js';

let wired = false;
let onHome = null;

function dialog() {
    return el('solved-dialog');
}

function wire() {
    if (wired) return;
    wired = true;
    // The action runs on the button's own click rather than the dialog's
    // asynchronous close event, so it stays tied to the deliberate press.
    el('solved-home').addEventListener('click', () => {
        const go = onHome;
        onHome = null;
        go?.();
    });
    el('solved-stay').addEventListener('click', () => { onHome = null; });
    dialog().addEventListener('cancel', () => { onHome = null; });
}

export function closeSolved() {
    onHome = null;
    const node = dialog();
    if (typeof node.close === 'function' && node.open) node.close();
}

/**
 * @param {{ title: string, time: string, failedChecks: number, marks: number,
 *           onHome: () => void }} details
 */
export function showSolved(details) {
    wire();
    onHome = details.onHome;

    el('solved-puzzle').textContent = details.title;
    el('solved-time').textContent = details.time;
    el('solved-checks').textContent = String(details.failedChecks);
    // Eine Fehlpruefung, nicht "1 Fehlpruefungen" - dieselbe Regel wie auf den
    // Ergebniskarten, von denen diese Zeile ihre Form hat.
    el('solved-checks-word').textContent =
        details.failedChecks === 1 ? 'Fehlprüfung' : 'Fehlprüfungen';
    el('solved-marks').textContent = String(details.marks);
    // Jeder Aufruf beginnt ohne Erfahrungsblock; er kommt nach, wenn der Stand
    // da ist. Sonst zeigte das naechste geloeste Raetsel kurz die Zahlen des
    // vorigen.
    el('solved-xp').hidden = true;

    const node = dialog();
    if (typeof node.showModal === 'function') node.showModal();
}

/**
 * Traegt den Erfahrungsstand nach, sobald er vorliegt.
 *
 * Getrennt von showSolved, weil der Dialog im selben Augenblick aufgehen soll
 * wie das geloeste Raetsel - auf das Netz zu warten wuerde genau den Moment
 * verzoegern, um den es geht. Wird nichts uebergeben, bleibt der Block weg.
 *
 * @param {{ gain: number | null, xp: number, level: number,
 *           intoLevel: number, levelSpan: number } | null} standing
 */
export function showSolvedExperience(standing) {
    const block = el('solved-xp');
    if (!standing) { block.hidden = true; return; }

    // Der Zuwachs fehlt beim allerersten Mal, weil es keinen Stand davor gibt,
    // mit dem sich vergleichen liesse. Dann nur der Gesamtstand.
    el('solved-xp-gain').textContent = standing.gain === null || standing.gain <= 0
        ? `${standing.xp} Erfahrung`
        : `+${standing.gain}`;
    el('solved-xp-level').textContent = `Stufe ${standing.level}`;

    const anteil = standing.levelSpan > 0
        ? Math.max(0, Math.min(1, standing.intoLevel / standing.levelSpan))
        : 0;
    el('solved-xp-fill').style.width = `${Math.round(anteil * 100)}%`;
    block.hidden = false;
}
