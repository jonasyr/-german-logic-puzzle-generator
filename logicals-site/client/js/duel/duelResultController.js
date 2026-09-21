import { setHint } from '../dom.js';
import { onLeave, showScreen } from '../router.js';
import { renderDuelExperience, renderDuelResults } from '../screens/duelResultScreen.js';
import { cachedExperience, loadExperience } from '../stats/experience.js';
import { levelAt } from '../stats/level.js';
import { getDuelRoom } from './roomApi.js';

let controller = null;
let timer = null;
/*
 * Einmal je Abschluss, nicht bei jedem Poll: der Erfahrungsstand aendert sich
 * nicht mehr, und jede Abfrage kostet auf dem Mobilfunk.
 */
let experienceShown = false;

function stop() {
    controller?.abort();
    controller = null;
    clearTimeout(timer);
    timer = null;
}

/**
 * Traegt die verdiente Erfahrung nach - einmal.
 *
 * Wirft nicht: ohne Stand bleibt der Block weg, weil eine falsche Zahl
 * schlechter waere als keine. Der Zuwachs ist die Differenz zum gemerkten
 * Stand, damit die Formel allein im Worker lebt.
 */
function showExperienceOnce(player) {
    if (experienceShown) return;
    experienceShown = true;
    const vorher = cachedExperience(player.id);
    loadExperience(player.id).then(jetzt => {
        if (!jetzt) return;
        const stufe = levelAt(jetzt.xp);
        renderDuelExperience({
            gain: vorher ? jetzt.xp - vorher.xp : null,
            xp: jetzt.xp,
            level: stufe.level,
            intoLevel: stufe.intoLevel,
            levelSpan: stufe.levelSpan,
        });
    }).catch(() => { /* ohne Stand bleibt der Block weg */ });
}

async function poll(room, player) {
    controller = new AbortController();
    try {
        const response = await getDuelRoom(room.code, controller.signal);
        const complete = renderDuelResults(response.room, player.id);
        showExperienceOnce(player);
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
    // Jedes Duell traegt seinen eigenen Zuwachs nach. Ohne das Zuruecksetzen
    // bliebe der Block ab dem zweiten Duell aus.
    experienceShown = false;
    renderDuelExperience(null);
    renderDuelResults({ ...room, results: room.results || [] }, player.id);
    showScreen('screen-duel-result');
    poll(room, player);
}

export function initDuelResultController() {
    onLeave(from => { if (from === 'screen-duel-result') stop(); });
}
