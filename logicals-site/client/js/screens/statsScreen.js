/**
 * Renders what statistics.js computed.
 *
 * No arithmetic lives here. The numbers come from a module with no DOM so they
 * can be unit-tested in the same node environment as everything else, and this
 * file only decides how to say them.
 */

import { clear, make } from '../dom.js';

import { headToHead, personalStats } from '../stats/statistics.js';


function formatDuration(milliseconds) {
    const seconds = Math.max(0, Math.round(milliseconds / 1000));
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function formatSpan(milliseconds) {
    const minutes = Math.round(milliseconds / 60_000);
    if (minutes < 60) return `${minutes} min`;
    return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

function statRow(label, value) {
    const row = make('div', { className: 'stats-row' });
    row.append(make('dt', { text: label }), make('dd', { text: value }));
    return row;
}

function section(title) {
    const node = make('section', { className: 'stats-section' });
    node.append(make('h3', { text: title }));
    return node;
}

function personalSection(stats) {
    const node = section('Deine Entwicklung');
    const list = make('dl', { className: 'stats-list' });

    for (const entry of stats.byDifficulty) {
        // Median, not mean: one abandoned evening would drag an average
        // somewhere that describes nobody's experience.
        list.append(statRow(entry.difficulty, `${formatDuration(entry.medianMs)} · ${entry.solved} gelöst`));
    }

    if (stats.failedChecksTrend) {
        const { earlier, later } = stats.failedChecksTrend;
        /*
         * Deutsches Dezimalkomma, und der Pfeil sagt, wohin er zeigt.
         *
         * toFixed liefert "1.0"; auf einem sonst durchgehend deutschen
         * Bildschirm liest sich der Punkt wie ein Tippfehler. Und ein blosser
         * Pfeil nennt nur die Richtung, nicht die Wertung: bei Fehlpruefungen
         * ist "mehr" schlechter, was man dem Zeichen nicht ansieht. Die Deutung
         * steht deshalb daneben, statt sie dem Leser aufzubuerden.
         */
        const de = value => value.toFixed(1).replace('.', ',');
        const trend = later < earlier ? '↓ besser' : later > earlier ? '↑ schlechter' : '→ gleich';
        list.append(statRow('Fehlprüfungen', `${de(earlier)} → ${de(later)} ${trend}`));
    }

    list.append(statRow('Serie (Tagesrätsel)', `${stats.streak} ${stats.streak === 1 ? 'Tag' : 'Tage'}`));
    list.append(statRow('Gesamtzeit', formatSpan(stats.totalMs)));
    if (stats.best) list.append(statRow('Beste Zeit', formatDuration(stats.best.elapsedMs)));
    if (stats.longest) list.append(statRow('Längstes Rätsel', formatDuration(stats.longest.elapsedMs)));

    node.append(list);
    return node;
}

const OUTCOME_MARK = { won: '●', lost: '○', drawn: '◐' };
const OUTCOME_WORD = { won: 'gewonnen', lost: 'verloren', drawn: 'unentschieden' };

function duelSection(entry) {
    const node = section(`Gegen ${entry.opponent}`);
    const list = make('dl', { className: 'stats-list' });

    list.append(statRow('Bilanz', `${entry.won} – ${entry.lost} – ${entry.drawn}`));

    // Signed, so ahead and behind never read the same.
    const margin = entry.averageMarginMs;
    list.append(statRow(
        margin >= 0 ? 'Ø Vorsprung' : 'Ø Rückstand',
        formatDuration(Math.abs(margin)),
    ));

    for (const [difficulty, who] of Object.entries(entry.fasterAt)) {
        list.append(statRow(
            difficulty,
            who === 'me' ? 'du bist schneller' : `${entry.opponent} ist schneller`,
        ));
    }

    node.append(list);

    // A row of symbols is unreadable without being told what they mean, so it
    // is told - once, under the row, rather than left to be inferred.
    const strip = make('p', {
        className: 'stats-strip',
        text: entry.recent.map(outcome => OUTCOME_MARK[outcome]).join(' '),
    });
    strip.setAttribute('aria-label', `Letzte Duelle, neueste zuerst: ${entry.recent
        .map(outcome => OUTCOME_WORD[outcome]).join(', ')}`);
    node.append(strip);
    node.append(make('p', {
        className: 'stats-legend',
        text: `${OUTCOME_MARK.won} gewonnen · ${OUTCOME_MARK.lost} verloren`
            + ` · ${OUTCOME_MARK.drawn} unentschieden · neueste zuerst`,
        attrs: { 'aria-hidden': 'true' },
    }));
    return node;
}

/**
 * Rendert die Statistik in einen bereitgestellten Knoten.
 *
 * Lädt nicht selbst. Der Ergebnis-Bildschirm trägt beide Sichten und liest
 * einmal - vorher las er hier 100 Ergebnisse und in der Rätselliste nebenan 50,
 * also gaben zwei benachbarte Knöpfe verschiedene Antworten auf dieselbe Frage.
 *
 * @param {HTMLElement} node
 * @param {Array<object>} results  neueste zuerst
 * @param {string} today  Datum in Berliner Zeit, `YYYY-MM-DD`
 *
 * Erfahrung steht bewusst NICHT hier: sie hat ihren Platz im Kopf des
 * Bildschirms. Zweimal dieselbe Zahl auf einem Schirm ist genau der Fehler,
 * den "2/12" neben "3/12" schon einmal gemacht hat.
 */
export function renderStatsInto(node, results, today) {
    const body = clear(node);
    if (!results.length) return;
    body.append(personalSection(personalStats(results, today)));
    for (const entry of headToHead(results)) body.append(duelSection(entry));
}
