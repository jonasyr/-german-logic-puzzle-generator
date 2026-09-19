/**
 * Screen switching with scroll restoration, the system back gesture, and focus.
 *
 * The old version always smooth-scrolled to the top, which on iOS meant going
 * "back" to a long result list dumped you at the very beginning again.
 *
 * Every screen is a history entry now. Without that, Android's back button left
 * the app and iOS's edge swipe did nothing - in a Home Screen web app the most
 * jarring unnative behaviour there is. The in-app back buttons go through the
 * same path, so the two can never give different answers.
 */

const listeners = { enter: [], leave: [], back: [] };
const scrollPositions = new Map();
let current = 'screen-start';
/** Suppresses the push while we are reacting to popstate ourselves. */
let replaying = false;
/**
 * How many entries we pushed ourselves.
 *
 * A reload leaves exactly one entry, and history.back() would then leave the
 * app entirely - so a back button has to know when there is nothing to pop.
 */
let depth = 0;

export function onEnter(handler) { listeners.enter.push(handler); }
export function onLeave(handler) { listeners.leave.push(handler); }

/**
 * May the player leave this screen right now?
 *
 * A handler returning `false` refuses - it has usually opened a dialog. The
 * history entry is pushed forward again so the model and the address bar do not
 * drift apart.
 */
export function onBackRequest(handler) { listeners.back.push(handler); }

export function currentScreen() { return current; }

function applyScreen(id) {
    scrollPositions.set(current, window.scrollY);
    for (const handler of listeners.leave) handler(current, id);

    for (const screen of document.querySelectorAll('.screen')) {
        screen.classList.toggle('is-active', screen.id === id);
    }
    current = id;

    // Restore instantly rather than smooth-scrolling: an animated jump on a
    // freshly swapped screen reads as a glitch.
    window.scrollTo({ top: scrollPositions.get(id) ?? 0, behavior: 'auto' });
    moveFocus(id);

    for (const handler of listeners.enter) handler(id);
}

/**
 * Puts the focus on the new screen's heading.
 *
 * It used to stay on the button the switch had just removed; the browser then
 * falls back to <body>, so keyboard and screen-reader users started from the
 * top on every change. tabindex="-1" makes the heading focusable without
 * putting it in the tab order.
 */
function moveFocus(id) {
    const heading = document.querySelector(`#${id} h1, #${id} h2`);
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
}

export function showScreen(id) {
    if (id === current) return;
    applyScreen(id);
    if (replaying) return;
    history.pushState({ screen: id }, '');
    depth += 1;
}

/** Runs the veto handlers. */
function mayLeave() {
    for (const handler of listeners.back) {
        if (handler(current) === false) return false;
    }
    return true;
}

/**
 * The single way back, for the gesture and for every back button.
 *
 * Without an entry of our own to pop - after a reload, or when the app was
 * opened straight into a room link - going back would leave the app, so we go
 * home instead.
 */
export function goBack() {
    /*
     * Das Veto läuft nur an einer Stelle.
     *
     * Hier zu fragen UND `history.back()` auszulösen hieße, es zweimal zu
     * fragen - der popstate-Handler fragt ohnehin. Heute kostet das nichts,
     * weil die Antwort dieselbe ist; ein Handler mit Nebenwirkung, etwa einer,
     * der einen Dialog öffnet, würde ihn zweimal öffnen.
     */
    if (depth > 0) { history.back(); return; }

    // Ohne eigenen Eintrag gibt es kein popstate, das fragen könnte.
    if (!mayLeave()) return;
    showScreen('screen-start');
}

export function wireBackButtons() {
    // A button that means "back" pops rather than pushing, so pressing it and
    // swiping from the edge end up in the same place. Everything else is a
    // forward move and pushes, even when it names the start screen.
    for (const button of document.querySelectorAll('[data-goto]:not(.btn--back)')) {
        button.addEventListener('click', () => showScreen(button.dataset.goto));
    }
    for (const button of document.querySelectorAll('.btn--back')) {
        button.addEventListener('click', goBack);
    }

    history.replaceState({ screen: 'screen-start' }, '');
    window.addEventListener('popstate', event => {
        const target = event.state?.screen ?? 'screen-start';
        if (!mayLeave()) {
            // Refused: push the entry forward again, or the history now points
            // at a screen we are not on.
            history.pushState({ screen: current }, '');
            return;
        }
        depth = Math.max(0, depth - 1);
        replaying = true;
        applyScreen(target);
        replaying = false;
    });
}
