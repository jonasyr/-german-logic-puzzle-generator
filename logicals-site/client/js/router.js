/**
 * Screen switching with per-screen scroll restoration.
 *
 * The old version always smooth-scrolled to the top, which on iOS meant going
 * "back" to a long result list dumped you at the very beginning again.
 */

const listeners = { enter: [], leave: [] };
const scrollPositions = new Map();
let current = 'screen-start';

export function onEnter(handler) { listeners.enter.push(handler); }
export function onLeave(handler) { listeners.leave.push(handler); }

export function currentScreen() { return current; }

export function showScreen(id) {
    if (id === current) return;

    scrollPositions.set(current, window.scrollY);
    for (const handler of listeners.leave) handler(current, id);

    for (const screen of document.querySelectorAll('.screen')) {
        screen.classList.toggle('is-active', screen.id === id);
    }
    current = id;

    // Restore instantly rather than smooth-scrolling: an animated jump on a
    // freshly swapped screen reads as a glitch.
    const previous = scrollPositions.get(id) ?? 0;
    window.scrollTo({ top: previous, behavior: 'auto' });

    for (const handler of listeners.enter) handler(id);
}

export function wireBackButtons() {
    for (const button of document.querySelectorAll('[data-goto]')) {
        button.addEventListener('click', () => showScreen(button.dataset.goto));
    }
}
