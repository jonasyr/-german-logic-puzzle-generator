# UX-Überarbeitung: Abläufe, Einstellungen, Einführung

**Datum:** 2026-09-19
**Zweig:** `redesign/mobile-canvas-overview`

## Warum

Eine Analyse des gesamten Client-Flows hat sieben Befunde ergeben, von denen
einer ein belegter Fehler ist und die übrigen Reibung erzeugen, über die der
Spieler nachdenken muss. Jeder Befund unten ist im Code oder im Browser belegt,
nicht vermutet.

## Belegte Befunde

### B1 — Sackgasse nach dem Tagesrätsel (Fehler)

Die Zurück-Taste des Spielbildschirms ist fest verdrahtet
(`client/index.html:266`, `data-goto="screen-result"`). Im Browser gemessen:

```
DAILY BACK: label=← Übersicht -> screen=screen-result title="Heft" puzzles=0
```

Nach „Rätsel des Tages", nach „Weiterspielen" und im Duell landet der Spieler
auf einem leeren Heft, dessen eigene Zurück-Taste in die *Einstellungen* führt.

Im Duell verlässt derselbe Knopf ein laufendes Spiel **ohne Rückfrage**, während
„Prüfen" und „Löschen" je einen Bestätigungsdialog besitzen. Die Absicherung ist
invers zum Risiko.

### B2 — Der Heft-Bildschirm ist funktionslos

`collectOptions()` setzt `puzzleCount: 1` hart
(`client/js/screens/configScreen.js:78`). Der Bildschirm zeigt genau eine Karte
und kostet zwei Taps. Wege zum Spiel heute:

| Weg | Taps | Zwischenbildschirme |
|---|---|---|
| Rätsel des Tages | 1 | 0 |
| Eigenes Rätsel | 3 | 2 |

Dazu vier Begriffe für eine Absicht: *Rätsel erstellen* → *Einstellungen* →
*Rätsel erzeugen* → *Spielen*.

### B3 — Einstellungen sind nicht einheitlich verortet

Spiel-Vorlieben (`autoCross`, `hideClock`, `hideDuel`) liegen im
*Erzeugen*-Ablauf. Sie gelten auch fürs Tagesrätsel, dessen Ablauf diesen
Bildschirm nie passiert. Mitten im Spiel ist nichts änderbar, obwohl
`derivesCrosses()` die Vorliebe bei jeder Aktion neu liest
(`client/js/play/playController.js:95`) — die Technik trägt es bereits, es fehlt
nur die Oberfläche.

### B4 — Keine Einführung, keine Legende

Suche nach Anleitung/Tutorial/Hilfe/Legende im Client: null Treffer. Die
Bedeutung der vier Werkzeuge steht ausschließlich im `aria-label`
(`client/index.html:309-312`). Ein Screenreader-Nutzer wird informiert, ein
sehender nicht. `␣` für „löschen" ist nicht erratbar, „vermutet" nirgends
erklärt.

Zusätzlich existiert ein unbenannter vierter Zustand: Das aktive Werkzeug erneut
zu drücken entwaffnet es (`client/js/play/markTool.js:45`); danach bleiben alle
Tippser auf dem Gitter wirkungslos, ohne sichtbare Begründung.

### B5 — Zwei Bildschirme für dieselben Daten

„Meine Ergebnisse" und „Statistik" speisen sich aus `listPlayerResults`, stehen
direkt untereinander und widersprechen sich im Umfang: History lädt 50
(`client/js/screens/historyScreen.js:61`), Statistik 100
(`client/js/screens/statsScreen.js:113`).

### B6 — Keine System-Zurück-Geste

Kein `pushState`, kein `popstate` im gesamten Client. Auf Android beendet die
Zurück-Taste die App; auf iOS tut die Randwisch-Geste nichts. Seit dem
Home-Screen-Fix betrifft das den Normalbetrieb. Ebenso fehlt jede
Fokus-Verwaltung: `showScreen` schiebt nur Klassen, der Fokus bleibt auf dem
verschwundenen Knopf.

### B7 — Wortschatz und Chrome uneinheitlich

- „Fehlprüfungen" (Dialog, Statistik, Duell-Ergebnis) vs. „Fehlversuche"
  (`historyScreen.js:35,46`).
- Alle Bildschirme nutzen `btn--back` mit Chevron `‹`; der Spielbildschirm nutzt
  `btn--ghost btn--small` mit literalem `←`.

## Entwurf

### E1 — Heft entfällt

`screen-result` und `client/js/screens/resultScreen.js` werden entfernt. Die
Aktionsleiste der Einstellungen trägt beide Wege auf gleicher Tiefe:

```
[ Spielen ]        (primär, submit)
[ Duell starten ]  (ghost, entfällt bei hideDuel)
```

Beide erzeugen und öffnen unmittelbar. Damit: 1 Tap statt 3, keine Sackgasse
mehr, weil es kein Zwischenziel mehr gibt. „Anderer Seed" entfällt — es gab das
Rätsel vorher zu sehen, was es künftig nicht mehr gibt.

### E2 — Zurück wird kontextabhängig

Der Spielbildschirm merkt sich, woher er geöffnet wurde, und kehrt dorthin
zurück. Im Duell fragt er vorher nach, mit demselben `askConfirm`, das „Prüfen"
und „Löschen" schon benutzen. Der Knopf erhält die Chrome aller anderen
Zurück-Knöpfe (`btn--back` + Chevron).

### E3 — System-Zurück

`router.js` erhält einen History-Eintrag pro Bildschirm und reagiert auf
`popstate`. Ein abgelehnter Duell-Austritt schiebt den Eintrag zurück, damit
Modell und Adressleiste nicht auseinanderlaufen. Beim Bildschirmwechsel wandert
der Fokus auf die Überschrift des neuen Bildschirms.

### E4 — Legende und Ersteinführung

Unter der Werkzeugleiste steht dauerhaft eine kompakte Legende. Beim ersten
Öffnen eines Spiels erscheint einmalig eine kurze Erklärung der drei
Markierungen und des Entwaffnens, abgelegt unter einem eigenen
`localStorage`-Schlüssel.

Der entwaffnete Zustand wird benannt: Die Statuszeile sagt es, solange kein
Werkzeug gewählt ist.

### E5 — Einstellungen als eigener Bildschirm

`screen-settings` trägt die Spiel-Vorlieben, erreichbar vom Start **und** aus
dem Spiel. Die Rätsel-Parameter bleiben auf `screen-config`, das damit nur noch
beschreibt, welches Rätsel erzeugt wird.

### E6 — Ergebnisse und Statistik zusammen

Ein Bildschirm `screen-history` mit zwei Reitern; beide lesen einmal mit
Limit 100.

### E7 — Vereinheitlichung

„Fehlprüfungen" überall. Zurück-Knöpfe einheitlich.

## Nicht verhandelbar: keine neuen Layout-Fehler

Der Auftraggeber hat das ausdrücklich zur Bedingung gemacht, und diese
Codebasis hat die Erfahrung: Die Statuszeile war zweimal falsch platziert, bevor
sie saß. Deshalb geht dem Umbau ein automatischer Wächter voraus, und jede
folgende Aufgabe ruft ihn auf.

Zwei Invarianten:

- **Verdeckung.** Für jede interaktive Zelle muss `document.elementFromPoint` in
  ihrer Mitte die Zelle selbst liefern. Bewusste Overlays tragen
  `pointer-events: none` und werden von `elementFromPoint` übersprungen — die
  Prüfung unterscheidet damit automatisch zwischen einem Hinweis, der über dem
  Gitter schweben darf, und einem Element, das einen Tipp schluckt.
- **Stabilität.** Erscheinende oder verschwindende Texte dürfen das
  Begrenzungsrechteck des Gitters nicht verändern.

Dazu die schon vorhandenen Regeln: kein horizontales Scrollen, jedes sichtbare
Bedienelement mindestens 44 × 44 pt.

Der Wächter muss belegen, dass er greift: Ein absichtlich eingesetztes
verdeckendes Element muss ihn zum Ausschlagen bringen. Ein Wächter, dessen
Versagen nie beobachtet wurde, ist kein Wächter.

## Geltungsbereich

Nur der Client. Keine Änderung an Worker, Datenbank, Migrationen oder Hosting.
Die Speicherschlüssel (`storageKeyFor`, `logicals.prefs.v1`,
`logicals.players.v1`) bleiben byte-identisch, damit laufende Spiele und
gespeicherte Spieler erhalten bleiben.
