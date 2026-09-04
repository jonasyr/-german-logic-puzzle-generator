/** Result screen: booklet summary and one card per puzzle. */

import { el, make, clear, setHint } from '../dom.js';

function renderPuzzle(puzzle, onPlay) {
    const article = make('article', { className: 'puzzle' });

    article.append(make('h3', { text: `${puzzle.number}. ${puzzle.title}` }));
    article.append(make('p', { className: 'story', text: puzzle.story }));

    const chips = make('ul', { className: 'chips' });
    for (const category of puzzle.categories) {
        const chip = make('li', { className: 'chip' });
        chip.append(make('b', { text: `${category.label}: ` }),
                    document.createTextNode(category.values.join(', ')));
        chips.append(chip);
    }
    article.append(chips);

    article.append(make('p', { className: 'goal', text: `Zielfrage: ${puzzle.targetQuestion}` }));

    const clues = make('ol', { className: 'clues' });
    for (const clue of puzzle.clues) clues.append(make('li', { text: clue }));
    article.append(clues);

    const playButton = make('button', {
        className: 'btn btn--primary', text: 'Spielen', attrs: { type: 'button' },
    });
    playButton.addEventListener('click', () => onPlay(puzzle));
    const actions = make('div', { className: 'actions actions--row' });
    actions.append(playButton);
    article.append(actions);

    const details = make('details');
    details.append(make('summary', { text: 'Lösung anzeigen' }));

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
    details.append(table);
    article.append(details);

    article.append(make('p', {
        className: 'hint',
        text: `Automatisch geprüft · eindeutig lösbar · ${puzzle.verification.clueCount} Hinweise · `
            + `${puzzle.verification.distinctClueTypes} Hinweisarten · Seed ${puzzle.seed}`,
    }));

    return article;
}

export function renderBooklet(booklet, durationMs, { pdfAvailable, onPlay }) {
    el('result-title').textContent = booklet.title;
    el('result-subtitle').textContent = booklet.subtitle;

    const config = booklet.config;
    const meta = [
        `${booklet.puzzles.length} Rätsel`,
        `${config.categoryCount} × ${config.valuesPerCategory} Gitter`,
        `Schwierigkeit: ${config.difficulty}`,
        `Seed: ${config.seed}`,
        `Theme: ${config.themeId}`,
        `${(durationMs / 1000).toFixed(1)} s`,
    ];
    const list = clear(el('result-meta'));
    for (const entry of meta) list.append(make('li', { text: entry }));

    const container = clear(el('puzzle-list'));
    for (const puzzle of booklet.puzzles) container.append(renderPuzzle(puzzle, onPlay));

    el('pdf-button').disabled = !pdfAvailable;
    setHint('result-hint', pdfAvailable
        ? 'Das PDF enthält Deckblatt, Hinweisseiten, leere Logikgitter und die Lösungen.'
        : 'PDF-Export nicht verfügbar: python3 mit reportlab installieren (pip install reportlab).',
        !pdfAvailable);
}

export function triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = make('a');
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}
