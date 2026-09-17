/** Bootstraps the app and wires the screens together. */

import { el, setHint } from './dom.js';
import { showScreen, wireBackButtons } from './router.js';
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
            onPlay: puzzle => openPlay(puzzle, {
                mode: 'solo',
                player: getSelectedPlayer(),
                options: state.options,
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

function wire() {
    wireBackButtons();
    el('start-button').addEventListener('click', () => showScreen('screen-config'));

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
initPlayerController().then(openRoomFromUrl);
loadOptions(state).catch(error => setHint('config-hint', error.message, true));
