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
let onNext = null;

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
        forget();
        go?.();
    });
    el('solved-next').addEventListener('click', () => {
        const go = onNext;
        forget();
        go?.();
    });
    el('solved-stay').addEventListener('click', forget);
    dialog().addEventListener('cancel', forget);
}

/** Beide Handlungen fallen lassen - was immer den Dialog geschlossen hat. */
function forget() {
    onHome = null;
    onNext = null;
}

export function closeSolved() {
    forget();
    const node = dialog();
    if (typeof node.close === 'function' && node.open) node.close();
}

/**
 * @param {{ title: string, time: string, failedChecks: number, marks: number,
 *           onHome: () => void, onNext?: (() => void) | null }} details
 */
export function showSolved(details) {
    wire();
    onHome = details.onHome;
    onNext = details.onNext ?? null;

    /*
     * "Naechstes Raetsel" nur, wenn es eines gibt.
     *
     * Im freien Spiel und beim Tagesraetsel gibt es keins. Dann traegt "Zur
     * Startseite" die Hauptrolle - ein ausgegrauter Knopf waere eine leere
     * Versprechung.
     */
    const next = el('solved-next');
    const home = el('solved-home');
    next.hidden = !onNext;
    home.classList.toggle('btn--primary', !onNext);
    home.classList.toggle('btn--ghost', Boolean(onNext));

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
    /*
     * Rechts steht, was fehlt - nicht, wo man ist.
     *
     * "Stufe 7" beantwortete die Frage nicht, die sich nach einem Gewinn
     * stellt: wie weit ist es noch. In welcher Stufe man sich befindet, zeigt
     * der Balken darunter ohnehin.
     */
    const fehlt = Math.max(0, standing.levelSpan - standing.intoLevel);
    // Gross geschrieben wie im Ergebnis-Kopf: dieselbe Wendung, dieselbe Form.
    el('solved-xp-level').textContent = `Noch ${fehlt} bis Stufe ${standing.level + 1}`;

    const anteil = standing.levelSpan > 0
        ? Math.max(0, Math.min(1, standing.intoLevel / standing.levelSpan))
        : 0;
    el('solved-xp-fill').style.width = `${Math.round(anteil * 100)}%`;
    block.hidden = false;
}
