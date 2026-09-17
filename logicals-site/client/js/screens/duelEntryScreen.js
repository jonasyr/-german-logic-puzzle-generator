import { el, setHint } from '../dom.js';
import { showScreen } from '../router.js';

export function initDuelEntry(onJoin) {
    el('duel-join-button').addEventListener('click', () => showDuelEntry());
    el('duel-entry-form').addEventListener('submit', async event => {
        event.preventDefault();
        const code = el('duel-code').value.normalize('NFKC').trim().toUpperCase();
        const submit = event.submitter || el('duel-entry-submit');
        submit.disabled = true;
        setHint('duel-entry-hint', 'Rätsel wird abgeglichen …');
        try { await onJoin(code); }
        catch (error) { setHint('duel-entry-hint', error.message, true); }
        finally { submit.disabled = false; }
    });
}

export function showDuelEntry(code = '') {
    el('duel-code').value = code;
    setHint('duel-entry-hint', '');
    showScreen('screen-duel-entry');
}
