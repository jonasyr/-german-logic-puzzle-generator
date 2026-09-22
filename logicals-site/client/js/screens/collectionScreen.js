/**
 * Die Sammlung: zehn Kapitel, je zwölf Einträge.
 *
 * Macht aus einem Generator, der unendlich viel kann, etwas Endliches - und
 * damit etwas, das man zu Ende bringen kann. Unendlich heißt sonst: nichts ist
 * besonders, nichts ist je fertig, es gibt nichts zu sammeln.
 *
 * Nichts ist gesperrt. Der Weiter-Knopf schlägt den nächsten offenen Eintrag
 * vor, springen ist erlaubt - eine Sammlung, die zwingt, wäre das Gegenteil
 * dessen, wofür „Uhr ausblenden" und „Duell ausblenden" gebaut wurden.
 */

import { clear, el, make, setHint } from '../dom.js';
import { onEnter, showScreen } from '../router.js';
import { clearBusy, setBusy } from '../ui/busy.js';
import { fetchBooklet } from '../api.js';
import {
    chapterFor, chapters, newClueTypeAt, nextOpen, optionsFor, progressOf, totalProgress,
} from '../catalogue/catalogue.js';
import { cachedSolvedSeeds, loadSolvedSeeds } from '../catalogue/solvedSeeds.js';
import { listSavedGames, readSavedGame } from '../play/savedGames.js';

let solved = new Set();
/**
 * Was angefangen ist, je Seed: `{ sure, total }` — oder `null`, wenn nur die
 * Schlüssel gelesen wurden.
 *
 * Gelöste Einträge stehen hier nicht: ihr Haken sagt bereits alles, und 100 %
 * zu zeichnen sagt nichts darüber hinaus.
 */
let started = new Map();
/** Wurde für diesen Spieler schon einmal ein Stand ermittelt? */
let known = false;
let openPlayFn = null;
let activePlayer = null;
/** Welches Kapitel offen ist, damit das Betreten es neu zeichnen kann. */
let openThemeId = null;

/**
 * Die Zeile unter dem Knopf auf dem Startbildschirm.
 *
 * Bleibt verborgen, solange nichts bekannt ist. „0 von 120" wäre keine
 * Zurückhaltung, sondern eine Falschaussage: der Spieler hat vielleicht
 * vierzig gelöst, nur weiß dieses Gerät es noch nicht.
 */
export async function renderCollectionNote(player) {
    const note = el('collection-detail');
    if (!player) { note.hidden = true; return; }
    activePlayer = player;

    const show = () => {
        const total = totalProgress(solved);
        note.hidden = total.solved === 0;
        note.textContent = `${total.solved} von ${total.total} gelöst`;
    };

    // Erst der Zwischenspeicher, damit sofort etwas dasteht.
    solved = cachedSolvedSeeds(player.id);
    show();

    /*
     * Und dann wirklich nachfragen.
     *
     * Ohne das stünde der Fortschritt auf einem frischen Gerät erst da,
     * nachdem man die Sammlung einmal geöffnet hat - also ausgerechnet dort
     * nicht, wo er hingehört. Die Abfrage ist eine Liste Zahlen und läuft
     * neben der ohnehin stattfindenden Ergebnisabfrage für das Tagesrätsel.
     */
    solved = await loadSolvedSeeds(player.id);
    known = true;
    show();
}

/**
 * Liest die Stände dieses Spielers.
 *
 * Zwei Stufen, weil das Lesen der Werte das Teure ist: die Schlüssel allein
 * genügen für „angefangen ja/nein" und damit für die Zahl in der
 * Kapitelübersicht. `withProgress` parst zusätzlich die Werte — das lohnt in
 * der Kapitelansicht, wo es zwölf sind, nicht in der Übersicht, wo es 120
 * wären.
 *
 * Dass ein Schlüssel überhaupt da liegt, heißt „hier wurde angefangen": ein
 * leeres Gitter hinterlässt keinen Stand (siehe `save`).
 */
function readStarted(playerId, withProgress) {
    const map = new Map();
    for (const eintrag of listSavedGames(playerId)) {
        if (solved.has(eintrag.seed)) continue;
        if (!withProgress) { map.set(eintrag.seed, null); continue; }
        const stand = readSavedGame(eintrag.key);
        if (!stand || stand.solved || stand.marks === 0) continue;
        map.set(eintrag.seed, { sure: stand.sure, total: stand.total });
    }
    return map;
}

function chapterRow(chapter) {
    const part = progressOf(chapter, solved);
    const done = part.solved === part.total;
    const offen = chapter.entries.filter(entry => started.has(entry.seed)).length;
    const row = make('button', {
        className: `list-row chapter-row${done ? ' is-solved' : ''}`,
        attrs: { type: 'button' },
    });
    row.append(make('h3', { text: chapter.title }));
    row.append(make('p', {
        className: 'list-row__score',
        /*
         * Eine Schreibweise fuer Fortschritt in der ganzen App: "x von y".
         *
         * Vorher stand hier "2/12", waehrend die Kopfzeile "3 von 120 geloest"
         * und die Kapitelseite "1 von 12 geloest" sagten - drei Notationen fuer
         * dieselbe Aussage, zwei davon einen Tap auseinander. Schlimmer noch:
         * die Zeile unter "Weiter spielen" nannte eine RAETSELNUMMER in
         * derselben Form, sodass "3/12" und "2/12" fuer dasselbe Kapitel
         * Verschiedenes bedeuteten. Die Nummer heisst jetzt "Nr. 3", der
         * Fortschritt ueberall "x von y".
         */
        /*
         * Angefangene kommen als Angabe auf dieselbe Zeile, nicht als zweite.
         * Sie faellt weg, wenn es keine gibt - "0 angefangen" waere Laerm.
         */
        text: done
            ? `${part.solved} von ${part.total} ✓`
            : offen > 0
                ? `${part.solved} von ${part.total} · ${offen} angefangen`
                : `${part.solved} von ${part.total}`,
    }));

    /*
     * Ein feiner Strich, keine Fortschrittsanzeige.
     *
     * Zehn Zeilen "0/12" untereinander sind eine Wand aus Nullen - und genau
     * dort entscheidet sich, ob jemand anfaengt. Drei Pixel unten an der Zeile
     * sagen dasselbe als Form statt als Ziffer, ohne der Liste Gewicht zu
     * geben. Fuer Screenreader traegt die Zahl daneben die Auskunft bereits,
     * also bleibt der Strich dekorativ.
     *
     * Bei einem unberuehrten Kapitel bleibt er ganz weg. Eine leere Spur ueber
     * die volle Breite traegt null Auskunft und sah wie eine verirrte
     * Trennlinie aus - und in der Kapitelansicht bekommt ein unberuehrter
     * Eintrag ohnehin keinen. Dieselbe Form soll sich nicht auf zwei
     * Bildschirmen gegensaetzlich verhalten.
     *
     * Zwei Abschnitte: gelöst in voller Farbe, angefangen blasser direkt
     * daneben. Sonst naennte die Zeile "2 von 12 · 1 angefangen" eine Zahl,
     * die im Balken gar nicht vorkaeme.
     */
    if (part.solved > 0 || offen > 0) {
        const meter = make('span', { className: 'chapter-meter', attrs: { 'aria-hidden': 'true' } });
        const fill = make('span', { className: 'chapter-meter__fill' });
        fill.style.width = `${Math.round((part.solved / part.total) * 100)}%`;
        meter.append(fill);
        if (offen > 0) {
            const begonnen = make('span', { className: 'chapter-meter__started' });
            begonnen.style.width = `${Math.round((offen / part.total) * 100)}%`;
            meter.append(begonnen);
        }
        row.append(meter);
    }

    row.addEventListener('click', () => openChapter(chapter.themeId));
    return row;
}

function entryRow(chapter, entry, index, next) {
    const isSolved = solved.has(entry.seed);
    /*
     * Wo es weitergeht, markiert ein Akzentstreifen am linken Rand - kein
     * Text.
     *
     * Bei verstreut geloesten Eintraegen liegt die Luecke irgendwo in der
     * Mitte, und man soll sie sehen statt suchen. Eine Zeile "Hier geht es
     * weiter" waere lauter als noetig und machte die Zeile hoeher als ihre
     * Nachbarn.
     */
    const isNext = !isSolved && next !== null && entry.seed === next.seed;
    const row = make('button', {
        className: `list-row entry-row${isSolved ? ' is-solved' : ''}${isNext ? ' is-next' : ''}`,
        attrs: { type: 'button' },
    });
    if (isNext) row.setAttribute('aria-current', 'step');
    // Alle zwölf Einträge tragen denselben Titel, also trägt ihn die Zeile
    // nicht: Nummer, Gitter und Stufe sind das, was sie unterscheidet.
    row.append(make('h3', {
        text: `${entry.number}. ${entry.categoryCount}×${entry.valuesPerCategory} · ${entry.difficulty}`,
    }));
    /*
     * Höchstens EINE Statuszeile, Rangfolge gelöst → angefangen → Neu-Hinweis.
     *
     * Kein Eintrag soll um eine dritte Zeile wachsen. Wer angefangen hat,
     * kennt die neue Hinweisart bereits — die Zeile tritt zurück, statt sich
     * danebenzudrängen.
     */
    const stand = started.get(entry.seed) ?? null;
    if (isSolved) {
        row.append(make('p', { className: 'list-row__score', text: '✓ gelöst' }));
    } else if (stand) {
        /*
         * Der Zustand wird benannt, nicht nur beziffert.
         *
         * "9 von 24 sicher" war das einzige Statuswort, das keines war:
         * geloest hat "gelöst", neu hat "Neu:", angefangen hatte nur eine
         * Zahlenzeile - und die Kapiteluebersicht verspricht ausdruecklich
         * "1 angefangen". Wer das Wort sucht, soll es finden.
         *
         * "sicher" war ausserdem Fachjargon. Das Wort "Zuordnungen" stand
         * hier kurz mit dabei und brach bei 320px auf eine zweite Zeile -
         * damit waere der Eintrag um genau die Zeile gewachsen, die er nicht
         * wachsen darf. Den Nenner erklaert der Balken darunter.
         */
        row.append(make('p', {
            className: 'list-row__score',
            text: `Angefangen · ${stand.sure} von ${stand.total}`,
        }));
        // Dieselbe Sprache wie die Kapitelkarte eine Ebene höher.
        const meter = make('span', { className: 'chapter-meter', attrs: { 'aria-hidden': 'true' } });
        const fill = make('span', { className: 'chapter-meter__fill' });
        fill.style.width = `${Math.round((stand.sure / stand.total) * 100)}%`;
        meter.append(fill);
        row.append(meter);
    } else {
        const fresh = newClueTypeAt(chapter, index);
        if (fresh) row.append(make('p', { className: 'list-row__meta', text: `Neu: „${fresh}“` }));
    }
    row.addEventListener('click', () => playCatalogueEntry(chapter, entry));
    return row;
}

/**
 * Erzeugt einen Katalogeintrag und öffnet ihn.
 *
 * Mit Overlay: 5×5 schwer braucht gemessen 2,4 Sekunden. Ohne Anzeige tippt
 * man und es geschieht scheinbar nichts - lange genug, um ein zweites Mal zu
 * tippen.
 *
 * Exportiert, damit der Gelöst-Dialog „Nächstes Rätsel" anbieten kann, ohne
 * den Umweg über den Sammlungs-Bildschirm. Kein Zyklus: dieser Bildschirm
 * bekommt `openPlay` injiziert, statt es zu importieren.
 */
export async function playCatalogueEntry(chapter, entry) {
    setHint('chapter-hint', '');
    setHint('collection-hint', '');
    setBusy('Rätsel wird erzeugt …');
    try {
        const options = optionsFor(chapter, entry);
        const generated = await fetchBooklet(options);
        const puzzle = generated.booklet.puzzles[0];
        if (!puzzle) throw new Error('Dieses Rätsel konnte nicht erzeugt werden.');
        openPlayFn(puzzle, {
            mode: 'solo', player: activePlayer, options, puzzleIndex: 0,
            /*
             * Die Nummer aus dem Katalog, nicht die aus dem Heft.
             *
             * `puzzle.number` ist der Index im erzeugten Heft und damit bei
             * jedem Sammlungseintrag 1 — die Sammlung nennt denselben
             * Eintrag aber „3.". Zwei Bildschirme einen Tap auseinander
             * sagten Verschiedenes, und „Weiterspielen" konnte zwei Rätsel
             * desselben Kapitels nicht auseinanderhalten.
             */
            title: `${chapter.title} · Nr. ${entry.number}`,
        });
    } catch (error) {
        // Ein Eintrag, der nicht aufgeht, darf das Kapitel nicht blockieren.
        const target = openThemeId ? 'chapter-hint' : 'collection-hint';
        setHint(target, error.message, true);
    } finally {
        clearBusy();
    }
}

function openChapter(themeId) {
    openThemeId = themeId;
    drawChapter();
    showScreen('screen-chapter');
}

function drawChapter() {
    const chapter = chapterFor(openThemeId);
    if (!chapter) return;
    el('chapter-title').textContent = chapter.title;
    const part = progressOf(chapter, solved);
    el('chapter-progress').textContent = `${part.solved} von ${part.total} gelöst`;
    started = activePlayer ? readStarted(activePlayer.id, true) : new Map();
    const list = clear(el('entry-list'));
    const next = nextOpen(chapter, solved);
    chapter.entries.forEach((entry, index) => list.append(entryRow(chapter, entry, index, next)));
}

function drawCollection() {
    const total = totalProgress(solved);
    el('collection-total').textContent = known
        ? `${total.solved} von ${total.total} gelöst`
        : 'Wird geladen …';

    /*
     * Die erste Handlung ist Weiterspielen - kurz beschriftet, Ziel darunter.
     *
     * "Weiter: Finale beim Street-Food-Festival, 1" brach auf zwei Zeilen und
     * liess ein einsames ", 1" am Ende baumeln. Dieselbe Trennung wie beim
     * Tagesraetsel: Knopf sagt die Handlung, die Zeile darunter das Ziel.
     */
    const chapter = chapters().find(candidate => nextOpen(candidate, solved));
    const button = el('collection-continue');
    const next = el('collection-next');
    const done = el('collection-done');

    if (chapter) {
        const entry = nextOpen(chapter, solved);
        button.hidden = false;
        button.onclick = () => playCatalogueEntry(chapter, entry);
        next.hidden = false;
        /*
         * Keine "x/12"-Schreibweise hier.
         *
         * "3 von 12" liess bei 320px die 12 allein auf der zweiten Zeile
         * stehen; "3/12" haelt das Paar zwar zusammen, steht dann aber
         * direkt ueber der Kapitelkarte, die mit demselben Titel "2/12"
         * zeigt - dort aber "zwei geloest". Gleiche Form, zwei Bedeutungen,
         * 100 Pixel auseinander. Die Nummer heisst jetzt Nummer; sie deckt
         * sich mit der Numerierung in der Kapitelliste ("3. 5x5 · mittel").
         * Das geschuetzte Leerzeichen haelt "Nr." und die Ziffer zusammen.
         */
        next.textContent = `${chapter.title} · Nr. ${entry.number}`;
        done.hidden = true;
    } else {
        /*
         * Fertig heisst fertig, nicht "ausgegrauter Knopf".
         *
         * Ein deaktivierter Knopf nach 120 geloesten Raetseln sieht aus wie
         * ein Fehler - und das ist der eine Moment, in dem die Sammlung etwas
         * zu sagen haette.
         */
        button.hidden = true;
        button.onclick = null;
        next.hidden = true;
        done.hidden = false;
        done.textContent = 'Alle 120 gelöst. Die Sammlung ist vollständig.';
    }

    // Nur die Schluessel: 120 Werte zu parsen waere hier verschwendet.
    started = activePlayer ? readStarted(activePlayer.id, false) : new Map();
    const list = clear(el('chapter-list'));
    for (const chapter of chapters()) list.append(chapterRow(chapter));
}

export async function openCollection(player) {
    activePlayer = player;
    openThemeId = null;
    showScreen('screen-collection');
    // Erst aus dem Zwischenspeicher, damit sofort etwas dasteht.
    solved = cachedSolvedSeeds(player.id);
    known = solved.size > 0;
    drawCollection();
    solved = await loadSolvedSeeds(player.id);
    known = true;
    drawCollection();
}

export function initCollection({ onOpenPlay }) {
    openPlayFn = onOpenPlay;

    /*
     * Beim Betreten neu zeichnen.
     *
     * Der Router poppt den Verlauf, also kommt man aus einem gelösten Rätsel
     * per Zurück genau hierher - und ohne das behauptete der Bildschirm, der
     * eben gelöste Eintrag sei noch offen.
     */
    onEnter(async id => {
        if (id !== 'screen-collection' && id !== 'screen-chapter') return;
        if (!activePlayer) return;
        solved = await loadSolvedSeeds(activePlayer.id);
        known = true;
        if (id === 'screen-collection') drawCollection(); else drawChapter();
    });
}
