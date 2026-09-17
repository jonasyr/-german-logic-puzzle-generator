import { setHint } from '../dom.js';
import { onLeave, showScreen } from '../router.js';
import { renderDuelResults } from '../screens/duelResultScreen.js';
import { getDuelRoom } from './roomApi.js';

let controller = null;
let timer = null;

function stop() {
    controller?.abort();
    controller = null;
    clearTimeout(timer);
    timer = null;
}

async function poll(room, player) {
    controller = new AbortController();
    try {
        const response = await getDuelRoom(room.code, controller.signal);
        const complete = renderDuelResults(response.room, player.id);
        if (response.room.state === 'expired') {
            stop();
            setHint('duel-result-hint', 'Der Duellraum ist abgelaufen, bevor beide Ergebnisse gespeichert wurden.', true);
        } else if (!complete && response.room.state !== 'complete') {
            timer = setTimeout(() => poll(room, player), 1000);
        }
    } catch (error) {
        if (error.name === 'AbortError') return;
        setHint('duel-result-hint', 'Verbindung unterbrochen – erneuter Versuch …', true);
        timer = setTimeout(() => poll(room, player), 3000);
    }
}

export function openDuelResult({ room, player }) {
    stop();
    renderDuelResults({ ...room, results: room.results || [] }, player.id);
    showScreen('screen-duel-result');
    poll(room, player);
}

export function initDuelResultController() {
    onLeave(from => { if (from === 'screen-duel-result') stop(); });
}
