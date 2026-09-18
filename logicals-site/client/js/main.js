/** Bootstraps the app and wires the screens together. */

import { el, setHint } from './dom.js';
import { onLeave, showScreen, wireBackButtons } from './router.js';
import { fetchBooklet } from './api.js';
import { initPlayerController } from './players/playerController.js';
import { getSelectedPlayer } from './players/playerStore.js';
import { initResultOutbox } from './results/outbox.js';
import {
    loadOptions, collectOptions, updateTargetOptions, applyPalette, randomSeed,
} from './screens/configScreen.js';
import { renderBooklet } from './screens/resultScreen.js';
import { initPlay, openPlay } from './play/playController.js';
import { createDuelForPuzzle, initDuelController, openRoomFromUrl } from './duel/lobbyController.js';
import { initDuelResultController } from './duel/duelResultController.js';
import { clearResume, loadResume } from './play/resumeStore.js';
import { fingerprintPuzzle } from './generation/canonicalPuzzle.ts';

const state = { options: null, booklet: null, limits: null, pdfAvailable: false };

function setBusy(text) {
    el('overlay-text').textContent = text;
    el('overlay').hidden = false;
}

function clearBusy() {
    el('overlay').hidden = true;
}

async function generate() {
    const options = collectOptions();
    setBusy('Rätsel werden erzeugt und geprüft …');
    try {
        const data = await fetchBooklet(options);
        state.options = options;
        state.booklet = data.booklet;
        renderBooklet(data.booklet, data.durationMs, {
            onPlay: (puzzle, puzzleIndex) => openPlay(puzzle, {
                mode: 'solo',
                player: getSelectedPlayer(),
                options: state.options,
                puzzleIndex,
            }),
            onDuel: (puzzle, puzzleIndex) => createDuelForPuzzle({
                player: getSelectedPlayer(),
                options: data.booklet.config,
                puzzle,
                puzzleIndex,
            }).catch(error => setHint('result-hint', error.message, true)),
        });
        showScreen('screen-result');
        setHint('config-hint', '');
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

function refreshResumeButton() {
    const button = el('resume-button');
    const player = getSelectedPlayer();
    const record = player ? loadResume(player.id) : null;
    button.hidden = !record;
    if (record) el('resume-detail').textContent = describeResume(record);
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
    if (!record) { refreshResumeButton(); return; }

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
        refreshResumeButton();
        setHint('start-hint', error.message, true);
    } finally {
        clearBusy();
    }
}

function wire() {
    wireBackButtons();
    el('start-button').addEventListener('click', () => showScreen('screen-config'));
    el('resume-button').addEventListener('click', resumeSavedGame);

    // Coming back from a game is exactly when the offer changes: it appears
    // after the first mark, and disappears once the puzzle is solved.
    onLeave(from => { if (from === 'screen-play') refreshResumeButton(); });

    el('field-categoryCount').addEventListener('change', updateTargetOptions);
    el('field-palette').addEventListener('change', event => applyPalette(event.target.value));
    el('seed-random').addEventListener('click', () => { el('field-seed').value = randomSeed(); });

    el('config-form').addEventListener('submit', event => {
        event.preventDefault();
        generate();
    });

    el('reroll-button').addEventListener('click', () => {
        el('field-seed').value = randomSeed();
        generate();
    });

    initPlay();
    initDuelController({ onOpenPlay: openPlay });
    initDuelResultController();
}

wire();
initResultOutbox();
initPlayerController().then(() => {
    openRoomFromUrl();
    refreshResumeButton();
});
loadOptions(state).catch(error => setHint('config-hint', error.message, true));
