/** Bootstraps the app and wires the screens together. */

import { el, setHint } from './dom.js';
import { showScreen, wireBackButtons } from './router.js';
import { fetchBooklet, fetchPdf } from './api.js';
import {
    loadOptions, collectOptions, updateTargetOptions, applyPalette, randomSeed,
} from './screens/configScreen.js';
import { renderBooklet, triggerDownload } from './screens/resultScreen.js';
import { initPlay, openPlay } from './play/playController.js';

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
            pdfAvailable: state.pdfAvailable,
            onPlay: openPlay,
        });
        showScreen('screen-result');
        setHint('config-hint', '');
    } catch (error) {
        setHint('config-hint', error.message, true);
    } finally {
        clearBusy();
    }
}

async function downloadPdf() {
    if (!state.options) return;
    setBusy('PDF wird gerendert …');
    try {
        const { blob, filename } = await fetchPdf(state.options);
        triggerDownload(blob, filename);
        setHint('result-hint', 'PDF heruntergeladen.');
    } catch (error) {
        setHint('result-hint', error.message, true);
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

    el('pdf-button').addEventListener('click', downloadPdf);
    el('reroll-button').addEventListener('click', () => {
        el('field-seed').value = randomSeed();
        generate();
    });

    initPlay();
}

wire();
loadOptions(state).catch(error => setHint('config-hint', error.message, true));
