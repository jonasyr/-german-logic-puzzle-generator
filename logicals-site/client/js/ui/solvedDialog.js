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
 *           note?: string, onHome: () => void }} details
 */
export function showSolved(details) {
    wire();
    onHome = details.onHome;

    el('solved-puzzle').textContent = details.title;
    el('solved-time').textContent = details.time;
    el('solved-checks').textContent = String(details.failedChecks);
    el('solved-marks').textContent = String(details.marks);
    el('solved-note').textContent = details.note ?? '';

    const node = dialog();
    if (typeof node.showModal === 'function') node.showModal();
}
