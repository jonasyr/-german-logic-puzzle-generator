# Die Sammlung: ein endliches Heft aus einem unendlichen Generator

**Datum:** 2026-09-19
**Zweig:** `redesign/mobile-canvas-overview`

## Warum

Die App erzeugt unendlich viele Rätsel. Für Bindung ist das schwächer als es
klingt: Unendlich heißt, dass nichts besonders ist, nichts je zu Ende geht und
es nichts zu sammeln gibt. Es fehlt ein Grund, abends noch einmal zu öffnen,
der nicht aus Druck besteht.

Vorbild war Katana Nonogram — dort ziehen eine durchblätterbare Bibliothek und
die Enthüllung am Ende jedes Rätsels. Die Bibliothek besteht dort aus 195.359
von Menschen gebauten Rätseln mit Autoren, Kommentaren und einer Top-100. Das
ist hier nicht erreichbar und wird nicht nachgebaut.

Erreichbar ist die **Struktur**: ein endlicher Katalog, den man durchblättert,
abhakt und zu Ende bringen kann.

### Was diese App über sich selbst sagt

Der Entwurf hält sich an einen Ton, der im Bestand bereits festgelegt ist:

- „Uhr ausblenden" existiert, weil sichtbarer Zeitdruck für viele eher Hürde
  als Reiz ist.
- „Duell-Funktionen ausblenden" entfernt den Wettkampf vollständig.
- Die Statistik rechnet Median statt Mittelwert, damit ein abgebrochener Abend
  nichts verzerrt.
- Es gibt kein Scheitern.

Daraus folgt die Leitregel: **Was man ansammelt, darf nie fallen. Was Druck
macht, muss man absichtlich betreten.** Ein Rating, das nach einem langsamen
Abend sinkt, ist ausgeschlossen. Eine Serie, die ein verpasster Tag vernichtet,
ebenfalls.

## Gemessene Grundlagen

Alles Folgende wurde am vorhandenen Generator gemessen, nicht angenommen.

**Zehn Themen**, je fünf Kategorien: `streetfood`, `nachtzug`, `escape-room`,
`sternwarte`, `plattenmarkt`, `hackathon`, `fotowettbewerb`, `gartenfest`,
`museum`, `triathlon`.

**Titel sind pro Thema konstant.** Alle Sternwarte-Rätsel heißen
„Beobachtungsnacht in der Sternwarte". Eine Kapitelliste kann ihre Einträge
also nicht über den Titel unterscheiden.

**Die Schwierigkeit ist bereits ein Lehrplan über die Hinweisarten:**

| Stufe | Zeit | Hinweise | Arten |
|---|---|---|---|
| 3×4 leicht | 40–60 ms | 5–6 | `BINARY`, `ORDINAL`, `SUPERLATIVE` |
| 4×4 mittel | 300–460 ms | 6 | + `BETWEEN`, `ADJACENCY` |
| 5×5 schwer | 2,4 s | 12–13 | + `OR` |

Ein Kapitel, das ansteigt, unterrichtet damit neue Hinweisarten, ohne dass der
Generator angefasst werden muss. Das ist der „Gedächtnistraining"-Anteil: eine
Eigenschaft der Steigerung, keine zweite Mechanik.

**Determinismus.** Gleicher Seed plus gleiche Einstellungen ergeben garantiert
dasselbe Rätsel; darauf baut schon das Weiterspielen über den Fingerprint. Ein
Katalog ist deshalb eine Liste von Zahlen und kostet keinen Speicher.

## Entwurf

### Der Katalogeintrag

Fünf Werte, kein gespeichertes Rätsel:

```
{ themeId, categoryCount, valuesPerCategory, difficulty, seed }
```

Dazu, aus dem Bau erzeugt: `fingerprint` (zur Prüfung) und `clueTypes` (für die
„Neu:"-Zeile).

**Seeds ab 1.000.000.** Das freie Spiel würfelt in 0…99.999; ohne getrennte
Bereiche könnte ein zufälliges Rätsel einen Kapiteleintrag als gelöst
markieren.

### Das Kapitel

Zehn Kapitel, je eines pro Thema, je zwölf Einträge mit fester Steigerung —
erst wächst das Gitter, dann die Schwierigkeit:

```
 1–2   3×4  leicht
 3–4   4×4  leicht
 5–6   4×4  mittel     erstmals BETWEEN / ADJACENCY
 7–8   4×5  mittel
 9–10  5×5  mittel
11–12  5×5  schwer     erstmals OR
```

120 Rätsel insgesamt, grob geschätzt zwanzig Stunden — und dann zu Ende, was
der Zweck ist.

### Der Katalog wird gebaut, nicht gewürfelt

Ein Skript erzeugt jeden Eintrag einmal, bestätigt, dass er durch das
Qualitätstor kommt, und schreibt Seed, Fingerprint und Hinweisarten in eine
eingecheckte Datei.

Der Grund: Nicht jeder Seed erzeugt ein gültiges Rätsel. In einer unendlichen
Liste ist ein Fehlschlag folgenlos — man bekommt das nächste. In einem
endlichen Kapitel wäre Eintrag 7 für immer tot.

### Bildschirme

**Startbildschirm**, in der Gruppe SPIELEN, direkt unter dem Tagesrätsel:

```
[ Sammlung ]
  23 von 120 · Sternwarte 5/12
```

Der Fortschritt steht damit sichtbar da, ohne dass man irgendwo hineingeht, und
die zweite Zeile sagt zugleich, wo es weitergeht.

**Kapitelübersicht** — zehn Zeilen mit Fortschritt:

```
Finale beim Street-Food-Festival     12/12  ✓
Abfahrt des Nachtzugs                 7/12  ▓▓▓▓▓▓░░░░░
Das verschlossene Archiv              0/12
```

**Kapitelliste** — weil alle Titel gleich sind, tragen Nummer, Größe und
Schwierigkeit die Zeile, plus das, was neu dazukommt:

```
 1  3×4  leicht                    ✓  4:12
 4  4×4  leicht                    ← weiter
 5  4×4  mittel     Neu: „liegt zwischen …"
11  5×5  schwer     Neu: „mindestens eines von …"
```

**Keine Sperren.** Der Pfeil schlägt den ersten offenen Eintrag vor; springen
ist erlaubt. Eine Sammlung, die zwingt, widerspricht der Leitregel.

### Fortschritt lesen

Ein Eintrag gilt als gelöst, wenn ein Ergebnis mit gleichem Seed, Thema,
Gitter und Schwierigkeit existiert. Das steht bereits in der Tabelle
`results` — **keine Migration, keine Schemaänderung.**

Die einzige Server-Änderung ist eine lesende Schnittstelle, weil die
bestehende Ergebnisliste bei 100 Einträgen gedeckelt ist und der Worker
darüber mit 400 antwortet:

```
GET /api/players/:id/solved-seeds  →  { "seeds": [1000001, 1000014, …] }
```

Nur Seeds aus dem Katalogbereich, aufsteigend. Eine Liste Zahlen.

**Offline:** Der Katalog ist eine mitgelieferte Datei, Durchblättern braucht
kein Netz. Die gelösten Seeds werden je Spieler lokal zwischengespeichert,
damit die Haken auch offline stehen. Ohne Netz und ohne Zwischenspeicher:
Katalog ohne Haken und eine leise Zeile — niemals ein gesperrter Knopf.

## Regeln, deren Bruch still schadet

**Ein bestehender Eintrag wird nie geändert. Nur angehängt.** Ändert jemand bei
Eintrag 7 den Seed, ist er für alle, die ihn gelöst haben, wieder offen — ohne
Fehlermeldung, ohne Spur. Neue Themen anzuhängen bleibt erlaubt.

**Der Fingerprint hält den Deploy an, nicht den Spieler.** Weicht er ab, hat
sich der Generator geändert und Kapitel 7 ist ein anderes Rätsel als letzten
Monat. Zur Laufzeit wird nicht geprüft: erzeugen und spielen. Die Abweichung
fängt die Prüfung, und ein Mensch entscheidet.

**Scheitert die Erzeugung zur Laufzeit** (Worker-Fehler), sagt der Bildschirm
das und lässt einen anderen Eintrag wählen — nicht wie heute beim
Weiterspielen ein Knopf, der ins Leere führt.

## Prüfung

**Schnell, in `npm test`:**

- Struktur: zehn Kapitel à zwölf, Steigerung monoton, Seeds eindeutig und
  ≥ 1.000.000, keine doppelten Tupel.
- Unveränderlichkeit: ein Abzug aller Fünfer-Tupel; verschiebt sich einer,
  schlägt der Test an.
- **Generator-Bindung:** Der Katalog hält `generatorVersion`
  (`1.4.1-logicals.b03a226`) und einen SHA-256 über die 16 Dateien in
  `vendor/logic-puzzle-generator/dist` fest. Der Test rechnet beides nach.

  Das ist der Ersatz für die langsame Prüfung im Alltag: Der Katalog kann nur
  ungültig werden, wenn sich der Generator ändert — und genau dann wird dieser
  Test rot und verweist auf den langsamen Befehl. Kosten: Millisekunden.

**Langsam, als eigener Befehl `npm run catalogue:verify`:**

Alle 120 Einträge werden nachgeneriert und ihre Fingerprints verglichen.
Verpflichtend im Deploy-Prompt.

Eine vollständige Kapitel-Steigerung wurde gemessen — **9,4 s**, also rund
**94 s für alle zehn Kapitel**, bei **null Fehlschlägen**:

| # | Gitter | Stufe | Zeit |
|---|---|---|---|
| 1–2 | 3×4 | leicht | 63 / 39 ms |
| 3–4 | 4×4 | leicht | 177 / 204 ms |
| 5–6 | 4×4 | mittel | 669 / 605 ms |
| 7–8 | 4×5 | mittel | 341 / 705 ms |
| 9–10 | 5×5 | mittel | 1300 / 2315 ms |
| 11–12 | 5×5 | schwer | 1285 / 1653 ms |

Dass die Steigerung ohne einen einzigen Fehlschlag durchläuft, ist zugleich der
erste Hinweis darauf, dass sich der Katalog überhaupt bauen lässt.

**Bildschirme:** Kapitelübersicht und Kapitelliste kommen in den bestehenden
Layout-Wächter (`e2e/support/layoutGuard.ts`) — Tapflächen, kein Querlauf, auch
bei 320 px. Der Zoom-Wächter bleibt unberührt; er gilt nur für den
Spielbildschirm.

**Ablauf, e2e:** Einen Katalogeintrag lösen → Haken erscheint, Kapitelzähler
steigt, Startbildschirm zeigt die neue Zahl. Derselbe Weg offline, mit
zwischengespeicherten Haken.

## Geltungsbereich

**Dazu gehört nicht:** Rating, Rangliste, adaptive Auswahl, Autoren,
Kommentare, verdeckte Titel, Kurzrätsel-Modus, Profil je Hinweisart.

Das Kurzrätsel und das Hinweisart-Profil bleiben eigene Vorhaben. Für gezieltes
Üben einer einzelnen Hinweisart wäre ohnehin eine Änderung am mitgelieferten
Generator nötig, weil die Booklet-Schicht nur `difficulty` durchreicht und
`allowedClueTypes` eine Ebene tiefer in der Engine liegt.

**Unverändert bleiben:** Datenbank-Schema, Migrationen, Hosting, Tagesrätsel,
Duell, freies Spiel. Die Speicherschlüssel bleiben byte-identisch.
