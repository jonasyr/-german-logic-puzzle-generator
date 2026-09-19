/** Bootstraps the app and wires the screens together. */

import { el, setHint } from './dom.js';
import { clearBusy, setBusy } from './ui/busy.js';
import { onLeave, showScreen, wireBackButtons } from './router.js';
import { fetchBooklet } from './api.js';
import { initPlayerController } from './players/playerController.js';
import { getSelectedPlayer } from './players/playerStore.js';
import { initResultOutbox } from './results/outbox.js';
import {
    loadOptions, collectOptions, updateTargetOptions, randomSeed, ensureSeed,
} from './screens/configScreen.js';
import { initSettingsScreen } from './screens/settingsScreen.js';
import {
    initCollection, openCollection, renderCollectionNote,
} from './screens/collectionScreen.js';
import { initPlay, openPlay } from './play/playController.js';
import { createDuelForPuzzle, initDuelController, openRoomFromUrl } from './duel/lobbyController.js';
import { initDuelResultController } from './duel/duelResultController.js';
import { clearResume, loadResume } from './play/resumeStore.js';
import { loadPrefs } from './play/playPrefs.js';
import {
    berlinDate, dailyDifficulty, dailyOptions, dailySeed, dailyStreak, isDailyResult,
} from './play/dailyPuzzle.js';
import { listPlayerResults } from './players/playerApi.js';
import { fingerprintPuzzle } from './generation/canonicalPuzzle.ts';

/*
 * The chosen options, kept so a finished puzzle can be recorded and resumed
 * with the exact configuration that produced it. The booklet itself is not
 * kept: exactly one puzzle is generated and it is played immediately.
 */
const state = { options: null };

/**
 * Erzeugt das eingestellte Rätsel und öffnet es unmittelbar.
 *
 * Es gab einen Heft-Bildschirm dazwischen, aus der Zeit, als ein Heft bis zu
 * zehn Rätsel hatte. `puzzleCount` steht seit langem fest auf 1, also zeigte er
 * genau eine Karte und kostete zwei Tippser - und war zugleich das Ziel, auf das
 * die Zurück-Taste des Spiels zeigte, auch wenn nie ein Heft erzeugt worden war.
 *
 * @param {'play'|'duel'} intent
 */
async function generate(intent) {
    const options = collectOptions();
    setBusy('Rätsel wird erzeugt und geprüft …');
    try {
        const data = await fetchBooklet(options);
        const puzzle = data.booklet.puzzles[0];
        if (!puzzle) throw new Error('Das Rätsel konnte nicht erzeugt werden.');
        state.options = options;
        setHint('config-hint', '');

        if (intent === 'duel') {
            await createDuelForPuzzle({
                player: getSelectedPlayer(),
                options: data.booklet.config,
                puzzle,
                puzzleIndex: 0,
            });
            return;
        }
        openPlay(puzzle, {
            mode: 'solo',
            player: getSelectedPlayer(),
            options,
            puzzleIndex: 0,
        });
    } catch (error) {
        setHint('config-hint', error.message, true);
    } finally {
        clearBusy();
    }
}

function describeResume(record) {
    const minutes = Math.floor(record.elapsedMs / 60_000);
    const seconds = Math.floor((record.elapsedMs % 60_000) / 1000);
    const clock = `${minutes}:${String(seconds).padStart(2, '0')}`;
    const marks = record.markCount === 1 ? '1 Markierung' : `${record.markCount} Markierungen`;
    return `${record.title} · ${clock} · ${marks}`;
}

const WEEKDAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

function describeDay(date) {
    // Noon UTC, so neither end of a daylight-saving shift can move the weekday.
    const moment = new Date(`${date}T12:00:00Z`);
    const month = moment.toLocaleDateString('de-DE', { month: 'long', timeZone: 'UTC' });
    return `${WEEKDAYS[moment.getUTCDay()]}, ${moment.getUTCDate()}. ${month}`;
}

function formatClock(milliseconds) {
    const minutes = Math.floor(milliseconds / 60_000);
    const seconds = Math.floor((milliseconds % 60_000) / 1000);
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Opens today's puzzle.
 *
 * Generated rather than fetched: the seed is the date, so everybody gets the
 * same puzzle without anything being stored or an endpoint being added.
 */
async function playDaily() {
    const player = getSelectedPlayer();
    if (!player) return;
    const date = berlinDate();
    const options = dailyOptions(date);

    setBusy('Rätsel des Tages wird erzeugt …');
    try {
        const generated = await fetchBooklet(options);
        const puzzle = generated.booklet.puzzles[0];
        if (!puzzle) throw new Error('Das Rätsel des Tages konnte nicht erzeugt werden.');
        setHint('start-hint', '');
        openPlay(puzzle, { mode: 'solo', player, options, puzzleIndex: 0 });
    } catch (error) {
        setHint('start-hint', error.message, true);
    } finally {
        clearBusy();
    }
}

/**
 * Says what today holds, and what has already been done with it.
 *
 * The history call is best effort. Generating the daily puzzle needs no
 * network, so a failure to read results must not leave the button unusable -
 * it simply says less.
 */
async function refreshDailyButton() {
    const button = el('daily-button');
    const detail = el('daily-detail');
    const player = getSelectedPlayer();
    button.disabled = !player;
    if (!player) { detail.hidden = true; return; }

    const date = berlinDate();
    detail.hidden = false;
    button.textContent = 'Rätsel des Tages';
    detail.textContent = `${describeDay(date)} · ${dailyDifficulty(date)}`;

    // 100 explicitly: the client default is 50, and a streak must be able to
    // reach further back than that. The Worker answers 400 above 100 rather
    // than clamping, so 100 is both the maximum and the ceiling.
    let results = [];
    try { results = await listPlayerResults(player.id, 100); } catch { return; }

    const seed = dailySeed(date);
    const solved = results.find(result => isDailyResult(result) && result.seed === seed);
    const streak = dailyStreak(results, date);
    const series = streak > 0 ? ` · Serie: ${streak} ${streak === 1 ? 'Tag' : 'Tage'}` : '';

    if (!solved) {
        detail.textContent += series;
        return;
    }
    // There is no other puzzle "nochmal" could mean: the seed is the day's.
    button.textContent = 'Nochmal spielen';
    detail.textContent = `Heute gelöst · ${formatClock(solved.elapsedMs)}${series}`;
}

function refreshStartScreen() {
    const button = el('resume-button');
    const player = getSelectedPlayer();
    const record = player ? loadResume(player.id) : null;
    const detail = el('resume-detail');
    button.hidden = !record;
    detail.hidden = !record;
    if (record) detail.textContent = describeResume(record);

    el('duel-join-button').hidden = loadPrefs().hideDuel;

    // Stacked primary buttons compete with each other, so exactly one is primary.
    // An interrupted puzzle is a stronger claim on attention than a fresh one,
    // and both outrank starting a new one from scratch.
    const daily = el('daily-button');
    daily.classList.toggle('btn--primary', !record);
    daily.classList.toggle('btn--on-dark', Boolean(record));
    const start = el('start-button');
    start.classList.remove('btn--primary');
    start.classList.add('btn--on-dark');

    renderCollectionNote(player);
    refreshDailyButton().catch(() => { /* best effort; see above */ });
}

/**
 * Rebuilds the saved game and reopens it.
 *
 * The puzzle is regenerated rather than restored, because it was never stored -
 * the same route the duel takes from a room's configuration. The fingerprint is
 * the guard: if a future generator produced a different booklet from the same
 * configuration, the marks would land on the wrong cells, and refusing is far
 * better than silently corrupting a game.
 */
async function resumeSavedGame() {
    const player = getSelectedPlayer();
    const record = player ? loadResume(player.id) : null;
    if (!record) { refreshStartScreen(); return; }

    setBusy('Gespeichertes Rätsel wird wiederhergestellt …');
    try {
        const generated = await fetchBooklet(record.options);
        const puzzle = generated.booklet.puzzles[record.puzzleIndex];
        if (!puzzle) throw new Error('Das gespeicherte Rätsel gibt es nicht mehr.');
        if (await fingerprintPuzzle(puzzle) !== record.fingerprint) {
            throw new Error('Das gespeicherte Rätsel lässt sich nicht mehr identisch erzeugen.');
        }
        setHint('start-hint', '');
        openPlay(puzzle, {
            mode: 'solo',
            player,
            options: record.options,
            puzzleIndex: record.puzzleIndex,
        });
    } catch (error) {
        // A button that leads nowhere is worse than no button.
        clearResume();
        refreshStartScreen();
        setHint('start-hint', error.message, true);
    } finally {
        clearBusy();
    }
}

function wire() {
    wireBackButtons();
    el('start-button').addEventListener('click', () => {
        // Opening the settings before the generator options have loaded must not
        // leave the seed field empty.
        ensureSeed();
        showScreen('screen-config');
    });
    el('resume-button').addEventListener('click', resumeSavedGame);
    el('daily-button').addEventListener('click', playDaily);

    // Coming back from a game is exactly when the offer changes: it appears
    // after the first mark, and disappears once the puzzle is solved.
    onLeave(from => { if (from === 'screen-play') refreshStartScreen(); });

    el('field-categoryCount').addEventListener('change', updateTargetOptions);
    el('seed-random').addEventListener('click', () => { el('field-seed').value = randomSeed(); });

    el('config-form').addEventListener('submit', event => {
        event.preventDefault();
        generate('play');
    });

    // Das Duell verschwindet vollständig, wenn der Spieler es ausgeblendet hat.
    // Dieselbe Regel hing vorher am Heft, das es nicht mehr gibt.
    const duelStart = el('duel-start-button');
    duelStart.hidden = loadPrefs().hideDuel;
    duelStart.addEventListener('click', () => generate('duel'));

    // Zwei Wege hinein: vom Start, und aus dem laufenden Spiel. Der Weg aus dem
    // Spiel läuft nicht über die Duell-Rückfrage - man verlässt das Duell dabei
    // nicht, man schaut nur kurz weg, und onLeave hält Uhr und Fortschritt an.
    initCollection({ onOpenPlay: openPlay });
    el('collection-button').addEventListener('click', () => {
        const player = getSelectedPlayer();
        if (player) openCollection(player);
    });

    initSettingsScreen();
    el('settings-button').addEventListener('click', () => showScreen('screen-settings'));
    el('play-settings').addEventListener('click', () => showScreen('screen-settings'));

    initPlay();
    initDuelController({ onOpenPlay: openPlay });
    initDuelResultController();
}

/*
 * Offline support. Registered after load so it never competes with the first
 * render, and guarded because a page opened over file:// or an old browser has
 * no serviceWorker at all - neither is a reason to fail to start.
 */
function registerServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(() => {
            // Playing works without it; only the offline launch is lost.
        });
    });
}

wire();
registerServiceWorker();
initResultOutbox();
initPlayerController().then(() => {
    openRoomFromUrl();
    refreshStartScreen();
});
loadOptions().catch(error => setHint('config-hint', error.message, true));
