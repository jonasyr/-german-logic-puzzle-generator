/**
 * The app's single confirmation dialog, shared by every action a mis-tap must
 * not trigger: revealing wrong marks, clearing the grid, and showing a solution.
 *
 * The confirmed action runs on the confirm button's click rather than on the
 * dialog's asynchronously dispatched "close" event, so it stays tied to the
 * deliberate press. Cancel, Escape and a programmatic close all clear it.
 */

import { el } from '../dom.js';

let pendingAction = null;
let wired = false;

function dialog() {
    return el('confirm-dialog');
}

function wire() {
    if (wired) return;
    wired = true;

    el('confirm-ok').addEventListener('click', () => {
        const action = pendingAction;
        pendingAction = null;
        action?.();
    });
    el('confirm-cancel').addEventListener('click', () => { pendingAction = null; });
    dialog().addEventListener('cancel', () => { pendingAction = null; });
}

/**
 * <dialog> only reached Safari in 15.4; before that the element parses as an
 * unknown element with no close()/showModal(). Every call is guarded so an older
 * browser degrades instead of throwing.
 */
export function closeConfirm() {
    pendingAction = null;
    const node = dialog();
    if (typeof node.close === 'function' && node.open) node.close();
}

/**
 * @param {object} options
 * @param {string} options.title
 * @param {string} options.text        what the confirmed action will do
 * @param {string} options.confirmLabel
 * @param {boolean} [options.destructive] styles the confirm button as dangerous
 * @param {() => void} options.onConfirm
 */
export function askConfirm({ title, text, confirmLabel, destructive, onConfirm }) {
    wire();
    const node = dialog();

    // No dialog support: act directly rather than blocking the feature entirely.
    if (typeof node.showModal !== 'function') { onConfirm(); return; }

    el('confirm-title').textContent = title;
    el('confirm-text').textContent = text;
    const ok = el('confirm-ok');
    ok.textContent = confirmLabel;
    ok.classList.toggle('btn--danger', Boolean(destructive));

    pendingAction = onConfirm;
    node.returnValue = '';
    node.showModal();
}
