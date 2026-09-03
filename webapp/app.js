/* Logicals web app: three screens (start -> settings -> result) on top of /api. */
(() => {
    'use strict';

    const PALETTES = {
        klassik: { label: 'Klassik', accent: '#C6492D', secondary: '#227C78', ink: '#172033' },
        nacht: { label: 'Nacht', accent: '#7C3AED', secondary: '#0F766E', ink: '#111827' },
        wald: { label: 'Wald', accent: '#2F6B3C', secondary: '#8A5A21', ink: '#1B2A20' },
        beere: { label: 'Beere', accent: '#B0245B', secondary: '#3C5CA8', ink: '#231428' },
    };

    const el = id => document.getElementById(id);
    const state = { options: null, booklet: null, limits: null, pdfAvailable: false };

    function showScreen(id) {
        if (id !== 'screen-play') stopTicker();
        document.querySelectorAll('.screen').forEach(screen => screen.classList.toggle('is-active', screen.id === id));
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function setBusy(text) {
        el('overlay-text').textContent = text;
        el('overlay').hidden = false;
    }

    function clearBusy() {
        el('overlay').hidden = true;
    }

    function setHint(id, message, isError = false) {
        const node = el(id);
        node.textContent = message;
        node.classList.toggle('is-error', isError);
    }

    function fillRange(select, min, max, selected) {
        select.innerHTML = '';
        for (let value = min; value <= max; value++) {
            const option = document.createElement('option');
            option.value = String(value);
            option.textContent = String(value);
            option.selected = value === selected;
            select.append(option);
        }
    }

    function updateTargetOptions() {
        const categoryCount = Number(el('field-categoryCount').value);
        const select = el('field-targetCategoryIndex');
        const previous = Number(select.value) || 1;
        select.innerHTML = '';
        for (let index = 1; index <= categoryCount - 2; index++) {
            const option = document.createElement('option');
            option.value = String(index);
            option.textContent = `${index + 1}. Kategorie`;
            select.append(option);
        }
        select.value = String(Math.min(previous, categoryCount - 2));
    }

    async function loadOptions() {
        const response = await fetch('/api/options');
        if (!response.ok) throw new Error('Optionen konnten nicht geladen werden.');
        const data = await response.json();
        state.limits = data.limits;
        state.pdfAvailable = data.pdfAvailable;

        fillRange(el('field-puzzleCount'), data.limits.puzzleCount.min, data.limits.puzzleCount.max, 5);
        fillRange(el('field-categoryCount'), data.limits.categoryCount.min, data.limits.categoryCount.max, 5);
        fillRange(el('field-valuesPerCategory'), data.limits.valuesPerCategory.min, data.limits.valuesPerCategory.max, 5);
        updateTargetOptions();

        const themeSelect = el('field-themeId');
        themeSelect.innerHTML = '';
        for (const theme of data.themes) {
            const option = document.createElement('option');
            option.value = theme.id;
            option.textContent = theme.title;
            themeSelect.append(option);
        }

        const paletteSelect = el('field-palette');
        paletteSelect.innerHTML = '';
        for (const [key, palette] of Object.entries(PALETTES)) {
            const option = document.createElement('option');
            option.value = key;
            option.textContent = palette.label;
            paletteSelect.append(option);
        }

        if (!data.pdfAvailable) {
            setHint('config-hint', 'Hinweis: Der PDF-Renderer ist nicht verfügbar (python3 + reportlab fehlen). Die Vorschau funktioniert trotzdem.', true);
        }
    }

    function collectOptions() {
        const title = el('field-title').value.trim();
        const subtitle = el('field-subtitle').value.trim();
        return {
            puzzleCount: Number(el('field-puzzleCount').value),
            categoryCount: Number(el('field-categoryCount').value),
            valuesPerCategory: Number(el('field-valuesPerCategory').value),
            themeId: el('field-themeId').value,
            difficulty: el('field-difficulty').value,
            targetCategoryIndex: Number(el('field-targetCategoryIndex').value),
            seed: Number(el('field-seed').value) || 0,
            ...(title ? { title } : {}),
            ...(subtitle ? { subtitle } : {}),
            colors: {
                accent: el('field-accent').value,
                secondary: el('field-secondary').value,
                ink: el('field-ink').value,
            },
        };
    }

    function renderPuzzle(puzzle) {
        const article = document.createElement('article');
        article.className = 'puzzle';

        const heading = document.createElement('h3');
        heading.textContent = `${puzzle.number}. ${puzzle.title}`;
        const story = document.createElement('p');
        story.className = 'story';
        story.textContent = puzzle.story;

        const chips = document.createElement('ul');
        chips.className = 'chips';
        for (const category of puzzle.categories) {
            const chip = document.createElement('li');
            chip.className = 'chip';
            const label = document.createElement('b');
            label.textContent = `${category.label}: `;
            chip.append(label, document.createTextNode(category.values.join(', ')));
            chips.append(chip);
        }

        const goal = document.createElement('p');
        goal.className = 'goal';
        goal.textContent = `Zielfrage: ${puzzle.targetQuestion}`;

        const clues = document.createElement('ol');
        clues.className = 'clues';
        for (const clue of puzzle.clues) {
            const item = document.createElement('li');
            item.textContent = clue;
            clues.append(item);
        }

        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Lösung anzeigen';
        const table = document.createElement('table');
        table.className = 'data-table';
        const labels = puzzle.categories.map(category => category.label);
        const head = document.createElement('tr');
        for (const label of labels) {
            const th = document.createElement('th');
            th.textContent = label;
            head.append(th);
        }
        const thead = document.createElement('thead');
        thead.append(head);
        const tbody = document.createElement('tbody');
        for (const row of puzzle.solutionRows) {
            const tr = document.createElement('tr');
            for (const label of labels) {
                const td = document.createElement('td');
                td.textContent = row[label];
                tr.append(td);
            }
            tbody.append(tr);
        }
        table.append(thead, tbody);
        details.append(summary, table);

        const verification = document.createElement('p');
        verification.className = 'hint';
        verification.textContent = `Automatisch geprüft · eindeutig lösbar · ${puzzle.verification.clueCount} Hinweise · `
            + `${puzzle.verification.distinctClueTypes} Hinweisarten · Seed ${puzzle.seed}`;

        const playButton = document.createElement('button');
        playButton.type = 'button';
        playButton.className = 'btn btn--primary btn--small';
        playButton.textContent = 'Spielen';
        playButton.addEventListener('click', () => openPlay(puzzle));
        const actions = document.createElement('div');
        actions.className = 'actions actions--row';
        actions.append(playButton);

        article.append(heading, story, chips, goal, clues, actions, details, verification);
        return article;
    }

    function renderBooklet(booklet, durationMs) {
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
        const list = el('result-meta');
        list.innerHTML = '';
        for (const entry of meta) {
            const item = document.createElement('li');
            item.textContent = entry;
            list.append(item);
        }

        const container = el('puzzle-list');
        container.innerHTML = '';
        for (const puzzle of booklet.puzzles) container.append(renderPuzzle(puzzle));

        el('pdf-button').disabled = !state.pdfAvailable;
        setHint('result-hint', state.pdfAvailable
            ? 'Das PDF enthält Deckblatt, Hinweisseiten, leere Logikgitter und die Lösungen.'
            : 'PDF-Export nicht verfügbar: python3 mit reportlab installieren (pip install reportlab).', !state.pdfAvailable);
    }

    async function generate() {
        const options = collectOptions();
        setBusy('Rätsel werden erzeugt und geprüft …');
        try {
            const response = await fetch('/api/booklet', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(options),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Erzeugung fehlgeschlagen.');
            state.options = options;
            state.booklet = data.booklet;
            renderBooklet(data.booklet, data.durationMs);
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
            const response = await fetch('/api/pdf', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(state.options),
            });
            if (!response.ok) {
                const data = await response.json().catch(() => ({}));
                throw new Error(data.error || 'PDF-Erzeugung fehlgeschlagen.');
            }
            const blob = await response.blob();
            const disposition = response.headers.get('Content-Disposition') || '';
            const match = disposition.match(/filename="([^"]+)"/);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = match ? match[1] : 'logicals.pdf';
            document.body.append(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
            setHint('result-hint', 'PDF heruntergeladen.');
        } catch (error) {
            setHint('result-hint', error.message, true);
        } finally {
            clearBusy();
        }
    }

    /* ---------------------------------------------------------------
     * Spielmodus: Logikgitter ausfüllen, Timer, Prüfen auf Wunsch.
     * Fehler werden ausschliesslich nach einem Klick auf "Prüfen"
     * angezeigt und verschwinden, sobald weitergespielt wird.
     * ------------------------------------------------------------- */

    const MARK_SYMBOLS = { yes: '○', no: '×' };
    const play = {
        puzzle: null,
        storageKey: null,
        marks: new Map(),
        truth: new Set(),
        cells: new Map(),
        wrong: new Set(),
        seconds: 0,
        paused: false,
        solved: false,
        ticker: null,
    };

    const { pairKey, cellKey, buildTruthSet, evaluate } = PlayLogic;

    function formatTime(seconds) {
        const minutes = Math.floor(seconds / 60);
        return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
    }

    function stopTicker() {
        if (play.ticker) {
            clearInterval(play.ticker);
            play.ticker = null;
        }
    }

    function startTicker() {
        stopTicker();
        if (play.paused || play.solved) return;
        play.ticker = setInterval(() => {
            play.seconds++;
            el('play-timer').textContent = formatTime(play.seconds);
            if (play.seconds % 5 === 0) savePlayState();
        }, 1000);
    }

    function renderTimer() {
        const timer = el('play-timer');
        timer.textContent = formatTime(play.seconds);
        timer.classList.toggle('is-paused', play.paused);
        el('play-pause').textContent = play.paused ? 'Weiter' : 'Pause';
    }

    function storageKeyFor(puzzle) {
        const dimensions = `${puzzle.categories.length}x${puzzle.categories[0].values.length}`;
        return `logicals:play:${puzzle.id}:${puzzle.seed}:${dimensions}`;
    }

    function savePlayState() {
        if (!play.storageKey) return;
        try {
            localStorage.setItem(play.storageKey, JSON.stringify({
                marks: [...play.marks], seconds: play.seconds, solved: play.solved,
            }));
        } catch { /* private mode or storage disabled – playing still works */ }
    }

    function loadPlayState() {
        try {
            const raw = localStorage.getItem(play.storageKey);
            if (!raw) return;
            const saved = JSON.parse(raw);
            if (Array.isArray(saved.marks)) play.marks = new Map(saved.marks);
            if (Number.isFinite(saved.seconds)) play.seconds = saved.seconds;
            play.solved = Boolean(saved.solved);
        } catch { /* ignore unreadable state */ }
    }

    /** Column blocks run over categories 2..n, rows over the first and then the remaining ones. */
    function gridAxes(count) {
        const columns = [];
        for (let index = 1; index < count; index++) columns.push(index);
        const rows = [0];
        for (let index = count - 1; index >= 2; index--) rows.push(index);
        return { columns, rows };
    }

    function paintCell(key) {
        const button = play.cells.get(key);
        if (!button) return;
        const mark = play.marks.get(key);
        button.textContent = mark ? MARK_SYMBOLS[mark] : '';
        button.classList.toggle('is-yes', mark === 'yes');
        button.classList.toggle('is-no', mark === 'no');
        button.classList.toggle('is-wrong', play.wrong.has(key));
        const state = mark === 'yes' ? 'sichere Zuordnung' : mark === 'no' ? 'ausgeschlossen' : 'leer';
        button.setAttribute('aria-label', `${button.dataset.label}: ${state}`);
    }

    function clearWrongMarks() {
        if (!play.wrong.size) return;
        const keys = [...play.wrong];
        play.wrong.clear();
        keys.forEach(paintCell);
    }

    function setStatus(message, isGood = false) {
        const status = el('play-status');
        status.textContent = message;
        status.classList.toggle('status-good', isGood);
        status.classList.remove('is-error');
    }

    function handleSolved() {
        play.solved = true;
        stopTicker();
        setStatus(`Gelöst in ${formatTime(play.seconds)}. Alle Zuordnungen stimmen.`, true);
        savePlayState();
    }

    function cycleMark(key) {
        if (play.solved) return;
        const current = play.marks.get(key);
        if (current === undefined) play.marks.set(key, 'no');
        else if (current === 'no') play.marks.set(key, 'yes');
        else play.marks.delete(key);

        clearWrongMarks();
        paintCell(key);
        savePlayState();

        if (evaluate(play.marks, play.truth).solved) {
            handleSolved();
        } else {
            setStatus('');
        }
    }

    function buildGrid(puzzle) {
        const { columns, rows } = gridAxes(puzzle.categories.length);
        const valueCount = puzzle.categories[0].values.length;
        play.cells.clear();

        const table = document.createElement('table');
        table.className = 'grid-table';

        const head = document.createElement('thead');
        const catRow = document.createElement('tr');
        const catSpacer = document.createElement('td');
        catSpacer.className = 'void';
        catSpacer.colSpan = 2;
        catRow.append(catSpacer);
        for (const categoryIndex of columns) {
            const cell = document.createElement('th');
            cell.className = 'cat-head';
            cell.colSpan = valueCount;
            cell.scope = 'colgroup';
            cell.textContent = puzzle.categories[categoryIndex].label;
            catRow.append(cell);
        }

        const valueRow = document.createElement('tr');
        const valueSpacer = document.createElement('td');
        valueSpacer.className = 'void';
        valueSpacer.colSpan = 2;
        valueRow.append(valueSpacer);
        for (const categoryIndex of columns) {
            puzzle.categories[categoryIndex].values.forEach(value => {
                const cell = document.createElement('th');
                cell.className = 'val-head';
                cell.scope = 'col';
                cell.textContent = value;
                valueRow.append(cell);
            });
        }
        head.append(catRow, valueRow);

        const body = document.createElement('tbody');
        rows.forEach((rowCategoryIndex, rowBlock) => {
            const rowCategory = puzzle.categories[rowCategoryIndex];
            const visibleBlocks = columns.length - rowBlock;

            rowCategory.values.forEach((rowValue, rowValueIndex) => {
                const tr = document.createElement('tr');
                if (rowValueIndex === 0) {
                    const side = document.createElement('th');
                    side.className = 'cat-side';
                    side.rowSpan = valueCount;
                    side.scope = 'rowgroup';
                    side.textContent = rowCategory.label;
                    tr.append(side);
                }
                const label = document.createElement('th');
                label.className = 'val-side';
                label.scope = 'row';
                label.textContent = rowValue;
                tr.append(label);

                columns.slice(0, visibleBlocks).forEach((colCategoryIndex, blockIndex) => {
                    const colCategory = puzzle.categories[colCategoryIndex];
                    colCategory.values.forEach((colValue, colValueIndex) => {
                        const td = document.createElement('td');
                        const classes = [];
                        if (colValueIndex === 0) classes.push('block-start');
                        if (colValueIndex === valueCount - 1) classes.push('block-end');
                        if (rowValueIndex === 0) classes.push('row-start');
                        if (rowValueIndex === valueCount - 1) classes.push('row-end');
                        td.className = classes.join(' ');

                        const key = cellKey(rowCategoryIndex, rowValueIndex, colCategoryIndex, colValueIndex);
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = 'cell';
                        button.dataset.label = `${rowValue} / ${colValue}`;
                        button.addEventListener('click', () => cycleMark(key));
                        play.cells.set(key, button);
                        td.append(button);
                        tr.append(td);
                        void blockIndex;
                    });
                });

                const hiddenBlocks = columns.length - visibleBlocks;
                if (hiddenBlocks > 0) {
                    const filler = document.createElement('td');
                    filler.className = 'void';
                    filler.colSpan = hiddenBlocks * valueCount;
                    tr.append(filler);
                }
                body.append(tr);
            });
        });

        table.append(head, body);
        const container = el('play-grid');
        container.innerHTML = '';
        container.append(table);
        play.cells.forEach((_, key) => paintCell(key));
    }

    function renderSolutionTable(puzzle) {
        const labels = puzzle.categories.map(category => category.label);
        const table = document.createElement('table');
        table.className = 'data-table';
        const thead = document.createElement('thead');
        const headRow = document.createElement('tr');
        for (const label of labels) {
            const th = document.createElement('th');
            th.textContent = label;
            headRow.append(th);
        }
        thead.append(headRow);
        const tbody = document.createElement('tbody');
        for (const row of puzzle.solutionRows) {
            const tr = document.createElement('tr');
            for (const label of labels) {
                const td = document.createElement('td');
                td.textContent = row[label];
                tr.append(td);
            }
            tbody.append(tr);
        }
        table.append(thead, tbody);
        const container = el('play-solution-table');
        container.innerHTML = '';
        container.append(table);
    }

    function openPlay(puzzle) {
        play.puzzle = puzzle;
        play.storageKey = storageKeyFor(puzzle);
        play.marks = new Map();
        play.wrong = new Set();
        play.seconds = 0;
        play.paused = false;
        play.solved = false;
        play.truth = buildTruthSet(puzzle);
        loadPlayState();

        el('play-title').textContent = `${puzzle.number}. ${puzzle.title}`;
        el('play-story').textContent = puzzle.story;
        el('play-goal').textContent = `Zielfrage: ${puzzle.targetQuestion}`;

        const clueList = el('play-clue-list');
        clueList.innerHTML = '';
        for (const clue of puzzle.clues) {
            const item = document.createElement('li');
            item.textContent = clue;
            clueList.append(item);
        }

        el('play-solution').open = false;
        renderSolutionTable(puzzle);
        buildGrid(puzzle);
        renderTimer();
        setStatus(play.solved ? 'Bereits gelöst.' : '', play.solved);

        showScreen('screen-play');
        startTicker();
    }

    function checkNow() {
        if (!play.puzzle) return;
        const result = evaluate(play.marks, play.truth);
        play.wrong = result.wrong;
        play.cells.forEach((_, key) => paintCell(key));

        if (result.solved) {
            handleSolved();
            return;
        }
        if (play.wrong.size > 0) {
            const label = play.wrong.size === 1 ? 'Markierung stimmt' : 'Markierungen stimmen';
            setStatus(`${play.wrong.size} ${label} nicht – rot hervorgehoben. Die Hervorhebung verschwindet, sobald du weiterspielst.`);
            return;
        }
        setStatus(`Bisher alles richtig. Es fehlen noch ${result.missing} sichere Zuordnungen.`, true);
    }

    function clearMarks() {
        play.marks.clear();
        play.wrong.clear();
        play.solved = false;
        play.cells.forEach((_, key) => paintCell(key));
        setStatus('');
        savePlayState();
        startTicker();
    }

    function togglePause() {
        if (play.solved) return;
        play.paused = !play.paused;
        renderTimer();
        if (play.paused) stopTicker();
        else startTicker();
    }

    function wire() {
        el('start-button').addEventListener('click', () => showScreen('screen-config'));
        document.querySelectorAll('[data-goto]').forEach(button => {
            button.addEventListener('click', () => showScreen(button.dataset.goto));
        });
        el('field-categoryCount').addEventListener('change', updateTargetOptions);
        el('seed-random').addEventListener('click', () => {
            el('field-seed').value = String(Math.floor(Math.random() * 100000));
        });
        el('field-palette').addEventListener('change', event => {
            const palette = PALETTES[event.target.value];
            if (!palette) return;
            el('field-accent').value = palette.accent;
            el('field-secondary').value = palette.secondary;
            el('field-ink').value = palette.ink;
        });
        el('config-form').addEventListener('submit', event => {
            event.preventDefault();
            generate();
        });
        el('pdf-button').addEventListener('click', downloadPdf);
        // The ticker only persists every few seconds, so flush before the page goes away.
        window.addEventListener('pagehide', savePlayState);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') savePlayState();
        });
        el('play-check').addEventListener('click', checkNow);
        el('play-clear').addEventListener('click', clearMarks);
        el('play-pause').addEventListener('click', togglePause);
        el('reroll-button').addEventListener('click', () => {
            el('field-seed').value = String(Math.floor(Math.random() * 100000));
            generate();
        });
    }

    wire();
    loadOptions().catch(error => setHint('config-hint', error.message, true));
})();
