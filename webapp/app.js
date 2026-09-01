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

        article.append(heading, story, chips, goal, clues, details, verification);
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
        el('reroll-button').addEventListener('click', () => {
            el('field-seed').value = String(Math.floor(Math.random() * 100000));
            generate();
        });
    }

    wire();
    loadOptions().catch(error => setHint('config-hint', error.message, true));
})();
