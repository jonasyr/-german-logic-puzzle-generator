/**
 * Die einmalige Erklärung der Markierungen.
 *
 * Es gab keine. Die Bedeutung der vier Werkzeuge stand ausschließlich im
 * `aria-label`, also erfuhr sie genau die Gruppe, die den Bildschirm nicht
 * sieht - und `␣` für löschen ist nicht erratbar.
 *
 * Beim ersten geöffneten Rätsel, nicht beim ersten Start: hier steht das
 * Gitter, von dem die Erklärung handelt.
 */

const STORAGE_KEY = 'logicals.seenIntro.v1';

export function showFirstRunIfNeeded() {
    let seen = false;
    // Im privaten Modus wirft schon der Lesezugriff. Dann lieber einmal zu viel
    // erklären als das Rätsel gar nicht zu öffnen.
    try { seen = localStorage.getItem(STORAGE_KEY) === '1'; } catch { seen = false; }
    if (seen) return;

    // Vor dem Öffnen merken: ein Absturz beim Anzeigen darf nicht dazu führen,
    // dass die Erklärung bei jedem Rätsel wiederkommt.
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* dann eben nicht */ }
    document.getElementById('intro-dialog')?.showModal();
}
