/**
 * Spiel-Vorlieben, an einem Ort, der kein Rätsel erzeugt.
 *
 * Sie lagen im Erzeugen-Ablauf: um die Uhr auszublenden, musste man erst
 * "Rätsel erstellen" drücken. Sie gelten aber auch fürs Tagesrätsel, dessen Weg
 * diesen Bildschirm nie passiert hat - und mitten im Spiel war nichts änderbar,
 * obwohl `derivesCrosses()` die Vorliebe bei jeder Aktion ohnehin neu liest.
 *
 * Getrennt von den Rätsel-Parametern, weil die beiden verschiedene Lebensdauern
 * haben: die einen beschreiben ein Rätsel, die anderen überdauern jedes.
 */

import { el } from '../dom.js';
import { loadPrefs, savePrefs } from '../play/playPrefs.js';

const KEYS = ['autoCross', 'hideClock'];

export function initSettingsScreen() {
    const prefs = loadPrefs();
    for (const key of KEYS) {
        const field = el(`field-${key}`);
        field.checked = prefs[key];
        // Bei jeder Änderung neu lesen: ein anderer Schalter kann seither
        // umgelegt worden sein, auch in einem zweiten Tab.
        field.addEventListener('change', () => savePrefs({ ...loadPrefs(), [key]: field.checked }));
    }
}
