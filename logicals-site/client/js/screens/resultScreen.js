/**
 * Result screen: booklet summary and one compact card per puzzle.
 *
 * The card is deliberately short. Printing every clue of every puzzle turned a
 * ten-puzzle booklet into ~13,000px of scrolling and buried "Spielen" below six
 * clues; the clues and the solution are one disclosure away instead, and they
 * are all available in the play screen anyway.
 */

import { el, make, clear, setHint } from '../dom.js';
import { askConfirm } from '../ui/confirmDialog.js';

function solutionTable(puzzle) {
    const labels = puzzle.categories.map(category => category.label);
    const table = make('table', { className: 'data-table' });

    const headRow = make('tr');
    for (const label of labels) headRow.append(make('th', { text: label }));
    const thead = make('thead');
    thead.append(headRow);

    const tbody = make('tbody');
    for (const row of puzzle.solutionRows) {
        const tr = make('tr');
        for (const label of labels) tr.append(make('td', { text: row[label] }));
        tbody.append(tr);
    }
    table.append(thead, tbody);
    return table;
}

/**
 * The solution is a spoiler, so revealing it goes through the same confirmation
 * as the play screen's "Prüfen" and "Löschen".
 */
function buildSolutionBlock(puzzle) {
    const wrapper = make('div', { className: 'solution' });
    const button = make('button', {
        className: 'btn btn--ghost btn--small',
        text: 'Lösung anzeigen',
        attrs: { type: 'button' },
    });
    const target = make('div');

    button.addEventListener('click', () => {
        askConfirm({
            title: 'Lösung anzeigen?',
            text: 'Du siehst die vollständige Lösung dieses Rätsels.',
            confirmLabel: 'Anzeigen',
            onConfirm: () => {
                clear(target).append(solutionTable(puzzle));
                button.remove();
            },
        });
    });

    wrapper.append(button, target);
    return wrapper;
}

function renderPuzzle(puzzle, puzzleIndex, onPlay, onDuel) {
    const article = make('article', { className: 'puzzle' });

    article.append(make('h3', { className: 'puzzle__title', text: `${puzzle.number}. ${puzzle.title}` }));
    article.append(make('p', { className: 'puzzle__story', text: puzzle.story }));

    const size = `${puzzle.categories.length}×${puzzle.categories[0].values.length}`;
    article.append(make('p', {
        className: 'puzzle__meta',
        text: `${size} · ${puzzle.verification.clueCount} Hinweise · Seed ${puzzle.seed}`,
    }));

    const actions = make('div', { className: 'puzzle__actions' });
    const playButton = make('button', {
        className: 'btn btn--primary btn--block',
        text: 'Spielen',
        attrs: { type: 'button' },
    });
    playButton.addEventListener('click', () => onPlay(puzzle));
    const duelButton = make('button', {
        className: 'btn btn--ghost btn--block',
        text: 'Duell',
        attrs: { type: 'button' },
    });
    duelButton.addEventListener('click', () => onDuel(puzzle, puzzleIndex));
    actions.append(playButton, duelButton);
    article.append(actions);

    const details = make('details', { className: 'puzzle__details' });
    details.append(make('summary', { text: 'Hinweise & Lösung' }));

    const chips = make('ul', { className: 'chips' });
    for (const category of puzzle.categories) {
        const chip = make('li', { className: 'chip' });
        chip.append(make('b', { text: `${category.label}: ` }),
                    document.createTextNode(category.values.join(', ')));
        chips.append(chip);
    }
    details.append(chips);

    details.append(make('p', { className: 'goal', text: `Zielfrage: ${puzzle.targetQuestion}` }));

    const clues = make('ol', { className: 'clues' });
    for (const clue of puzzle.clues) clues.append(make('li', { text: clue }));
    details.append(clues);

    details.append(buildSolutionBlock(puzzle));
    details.append(make('p', {
        className: 'puzzle__verification',
        text: `Automatisch geprüft · eindeutig lösbar · ${puzzle.verification.distinctClueTypes} Hinweisarten`,
    }));

    article.append(details);
    return article;
}

export function renderBooklet(booklet, durationMs, { onPlay, onDuel }) {
    el('result-title').textContent = booklet.title;
    el('result-subtitle').textContent = booklet.subtitle;

    const config = booklet.config;
    // Generation duration is developer noise, not something a reader acts on.
    void durationMs;
    const meta = [
        `${booklet.puzzles.length} Rätsel`,
        `${config.categoryCount} × ${config.valuesPerCategory} Gitter`,
        config.difficulty,
        `Seed ${config.seed}`,
    ];
    const list = clear(el('result-meta'));
    for (const entry of meta) list.append(make('li', { text: entry }));

    const container = clear(el('puzzle-list'));
    booklet.puzzles.forEach((puzzle, index) => container.append(renderPuzzle(puzzle, index, onPlay, onDuel)));

    setHint('result-hint', '');
}
