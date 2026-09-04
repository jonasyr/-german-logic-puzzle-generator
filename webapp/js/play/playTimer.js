/**
 * Elapsed-time clock.
 *
 * The old implementation incremented a counter inside setInterval. iOS Safari
 * suspends timers as soon as the tab is backgrounded or the screen locks, so
 * that counter silently under-reported: lock the phone for two minutes and the
 * puzzle clock stood still.
 *
 * Here the timestamps are the truth and the interval only repaints, so the
 * displayed time self-corrects the moment the page comes back.
 */

export function createTimer(onTick) {
    let startedAt = null;      // epoch ms of the current running stretch
    let accumulatedMs = 0;     // completed stretches
    let handle = null;

    const elapsedMs = () => accumulatedMs + (startedAt === null ? 0 : Date.now() - startedAt);

    function repaint() { onTick(elapsedMs()); }

    function schedule() {
        stopInterval();
        // Align to the next whole second so the display never skips a number.
        const delay = 1000 - (elapsedMs() % 1000);
        handle = setTimeout(function tick() {
            repaint();
            handle = setTimeout(tick, 1000);
        }, delay);
    }

    function stopInterval() {
        if (handle !== null) { clearTimeout(handle); handle = null; }
    }

    return {
        elapsedMs,

        /** Begins or resumes counting from the given already-elapsed total. */
        start(fromMs = 0) {
            accumulatedMs = fromMs;
            startedAt = Date.now();
            repaint();
            schedule();
        },

        pause() {
            if (startedAt === null) return;
            accumulatedMs += Date.now() - startedAt;
            startedAt = null;
            stopInterval();
            repaint();
        },

        resume() {
            if (startedAt !== null) return;
            startedAt = Date.now();
            repaint();
            schedule();
        },

        stop() {
            if (startedAt !== null) {
                accumulatedMs += Date.now() - startedAt;
                startedAt = null;
            }
            stopInterval();
            repaint();
        },

        reset(toMs = 0) {
            accumulatedMs = toMs;
            startedAt = null;
            stopInterval();
            repaint();
        },

        isRunning: () => startedAt !== null,

        /** Called when the page becomes visible again; re-derives from timestamps. */
        refresh() {
            repaint();
            if (startedAt !== null) schedule();
        },
    };
}

export function formatTime(totalMs) {
    const seconds = Math.max(0, Math.floor(totalMs / 1000));
    const minutes = Math.floor(seconds / 60);
    return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}
