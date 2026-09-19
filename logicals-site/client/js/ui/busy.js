/**
 * Die Ladeanzeige, geteilt.
 *
 * Lag privat in main.js, solange nur das Erzeugen sie brauchte. Die Sammlung
 * erzeugt ebenfalls, und ein 5×5 schwer dauert gemessen 2,4 Sekunden - lange
 * genug, dass ein Tipp ohne Anzeige als nicht angekommen gelesen und ein
 * zweites Mal getippt wird.
 */

import { el } from '../dom.js';

export function setBusy(text) {
    el('overlay-text').textContent = text;
    el('overlay').hidden = false;
}

export function clearBusy() {
    el('overlay').hidden = true;
}
