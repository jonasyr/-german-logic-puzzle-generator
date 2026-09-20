# Erfahrung: eine Zahl im Augenblick, nicht als Möbel

**Datum:** 2026-09-20
**Zweig:** `redesign/mobile-canvas-overview`

> **Zurückgestellt am 2026-09-20, nicht verworfen.**
>
> Beim Ausarbeiten stellte sich heraus, dass es nur zwei Werkzeuge gibt, die es
> ehrlich verdienen, hinter einer Stufe zu liegen — die Stufen trügen also über
> weite Strecken keine Freischaltung. Statt Tore zu erfinden, um die Lücken zu
> füllen, werden zuerst die Werkzeuge gebaut; ob eines davon ein Tor verdient,
> entscheidet sich dann am eigenen Gebrauch.
>
> Damit fiel auch der Maßstab weg, nach dem die zwei Werkzeuge ausgewählt
> worden waren: gefragt war „was darf man sperren?", nicht „was ist am
> wertvollsten?". Neu sortiert nach Wert beginnt die Arbeit an anderer Stelle —
> siehe `2026-09-20-erster-falscher-schluss`.
>
> Die Überlegungen unten gelten unverändert, falls später doch Punkte kommen:
> die Formel, die Platzierung im Gelöst-Dialog statt auf dem Startbildschirm,
> und der Grund dafür.

## Warum

Die Frage, aus der das hier entstanden ist, war die richtige: *„Level — aber
dann für was?"* Eine Zahl, die durch bloßes Weitermachen steigt, ist eine
Quittung, keine Auszeichnung. Sie sagt *wie viel*, nie *wie gut*.

Die Antwort dieses Entwurfs: Erfahrung schaltet **Werkzeuge** frei, nicht
Inhalt. Inhalt freizuschalten hieße, erst etwas wegzunehmen, um es später zu
„schenken" — in einer App, die bewusst nichts sperrt, wäre das ein Bruch.

## Die Leitregel, die aus dem Bestand folgt

Dieselbe wie bei der Sammlung: **Was man ansammelt, darf nie fallen.**
Erfahrung fällt nicht, kann nicht verloren gehen und es gibt keinen Verfall.

Dazu eine zweite, die sich heute erarbeitet wurde: **eine Antwort pro Frage.**
Zwei Ergebnisbildschirme wurden zusammengelegt, zwei „Einstellungen" entwirrt,
„Fehlversuche" und „Fehlprüfungen" vereinheitlicht. Ein Level neben der
Sammlung wäre eine zweite Fortschrittszahl auf demselben Bildschirm — beide
beantworten „wie weit bin ich?", nur verschieden.

Daraus folgt die wichtigste Entscheidung dieses Entwurfs.

## Wo die Zahl wohnt — und wo nicht

**Nicht auf dem Startbildschirm.** Der behält seine eine Zahl, die der
Sammlung.

**Im Gelöst-Dialog**, also in dem Augenblick, in dem sie verdient wird. Der
Dialog zeigt bereits Zeit, Fehlprüfungen und Markierungen:

```
Geschafft!
  Zeit 8:12 · Fehlprüfungen 0 · Markierungen 47
  ┌────────────────────────────────┐
  │ +45 · Stufe 7           ▓▓▓▓░░ │
  └────────────────────────────────┘
  Neu: Was-wäre-wenn-Ebene
```

**In „Ergebnisse & Statistik"** zum Nachschlagen, wo der Abschnitt „Deine
Entwicklung" bereits existiert.

Damit erscheint die Belohnung dort, wo sie etwas bedeutet, statt als Dauermöbel
— und ein freigeschaltetes Werkzeug wird ein Augenblick statt einer Zeile in
einer Liste.

## Erfahrung ist eine Funktion, kein Speicher

Jedes Ergebnis trägt bereits alles Nötige: `difficulty`, `failedChecks` und in
`configurationJson` die Werte `categoryCount` und `valuesPerCategory`.
Erfahrung wird daraus **gerechnet**, nicht gespeichert — sie kann damit nicht
mit der Wirklichkeit auseinanderlaufen.

**Keine Migration, keine Schemaänderung.**

### Die Formel

Ein Gitter mit `c` Kategorien und `v` Werten hat `C(c,2) · v²` Zellen — das ist
dieselbe Zahl, mit der `findContradictions` arbeitet (250 bei 5×5).

```
zellen  = c·(c−1)/2 · v²
gewicht = { leicht: 1.0, mittel: 1.4, schwer: 1.8 }[difficulty]
sauber  = failedChecks === 0 ? 1.25 : 1.0
punkte  = round(zellen · gewicht · sauber / 10)
```

| Rätsel | Zellen | Punkte | mit sauberer Lösung |
|---|---|---|---|
| 3×4 leicht | 48 | 5 | 6 |
| 4×4 mittel | 96 | 13 | 17 |
| 5×5 schwer | 250 | 45 | 56 |

**Warum an der Arbeit und nicht an der Zeit:** Hinge Erfahrung an der Dauer,
wäre Trödeln die beste Strategie. Hinge sie nur an der Anzahl, wären viele
winzige Rätsel das beste Verhältnis. Die Zellenzahl misst, wie viel tatsächlich
zu entscheiden war.

**Warum ein Bonus und nie ein Abzug:** Ohne Fehlprüfung zu lösen ist die
sauberere Leistung und wird erkannt — aber wer prüft, verliert nichts. Ein
Abzug wäre Druck, und Druck ist das, wogegen „Uhr ausblenden" gebaut wurde.

### Stufen

Feste Schwellen, keine Formel — damit ablesbar bleibt, wann was kommt:

| Stufe | ab Punkten |
|---|---|
| 1 | 0 |
| 2 | 40 |
| 3 | 100 |
| 4 | 200 |
| 5 | 350 |
| 6 | 550 |
| 7 | 800 |
| 8 | 1 100 |
| 9 | 1 500 |
| 10 | 2 000 |

Darüber je 700 Punkte. Stufe 7 entspricht 18 Rätseln der Sorte 5×5 schwer oder
rund 40 gemischten — also einem Kapitel der Sammlung plus etwas.

### Die Schnittstelle

Die Ergebnisliste ist bei 100 gedeckelt; Erfahrung zählt alle. Also eine
zweite schmale Leseschnittstelle, serverseitig summiert — dieselbe Bauart wie
`solved-seeds`:

```
GET /api/players/:id/experience  →  { "xp": 812, "solved": 47, "level": 7 }
```

## Welche Werkzeuge — und welche ausdrücklich nicht

**Nicht gesperrt wird, was Anfängern am meisten hilft.** Allen voran
**Hinweis antippen → betroffene Zellen leuchten**: das ist die größte
Bedienlücke der App und gerade für Ungeübte am wertvollsten. Es wegzusperren
würde den Anfang absichtlich schlechter machen.

*(Machbarkeit: Das Heft liefert Hinweise nur als `clues: string[]` plus
`clueTypes: number[]`; welche Zellen ein Hinweis betrifft, steht nirgends. Diese
Verknüpfung braucht eine Generator-Änderung und ist ein eigenes Vorhaben.)*

Gesperrt wird nur, was **vorher verwirrt**:

| Werkzeug | ab Stufe | Begründung |
|---|---|---|
| **Was-wäre-wenn-Ebene** — eine Annahme setzen, das Gitter durchspielen, wieder verwerfen | 5 | Vor einem gewissen Punkt verwechselt man sie mit der Vermutungs-Markierung. Sie ergibt erst Sinn, wenn man den Unterschied zwischen „vermutet" und „angenommen" kennt. |
| **Rückschau nach dem Lösen** — der eigene Weg, mit den Stellen, an denen es stockte | 3 | Nicht verwirrend, aber vor den ersten Rätseln inhaltsleer: sie braucht Vergangenheit, um etwas zu zeigen. |

## Ein Risiko, das offen benannt gehört

**Es gibt nicht viele Werkzeuge, die es verdienen, gesperrt zu werden.** Nach
ehrlicher Prüfung sind es zwei. Alles andere — die Hinweis-Verknüpfung, ein
Sprung zum ersten falschen Schluss, das automatische Abhaken ausgereizter
Hinweise — hilft Anfängern mindestens so sehr wie Geübten und gehört von Anfang
an dazu.

Das heißt: Die Stufen tragen über weite Strecken **keine** Freischaltung. Die
Zahl steigt, und zwischen Stufe 5 und irgendwann später passiert nichts.

Wer das für zu dünn hält, hat zwei ehrliche Auswege: die Erfahrung als reine
Anerkennung im Gelöst-Dialog stehen lassen und auf Freischaltungen ganz
verzichten — oder erst Werkzeuge bauen und später entscheiden, ob eines davon
ein Tor verdient.

Dieser Entwurf geht den ersten Weg **mit** den zwei genannten Toren und
verspricht nicht mehr.

## Fehlerfälle

**Ohne Netz** steht keine Erfahrung zur Verfügung. Der Gelöst-Dialog zeigt dann
seinen bisherigen Inhalt ohne den Erfahrungsblock — eine falsche Zahl wäre
schlechter als keine. Der zuletzt bekannte Stand wird je Spieler lokal
abgelegt, damit „Ergebnisse & Statistik" auch offline etwas zeigt.

**Ein freigeschaltetes Werkzeug bleibt frei**, auch wenn die Abfrage scheitert:
der Freischaltstand wird lokal gemerkt. Etwas wieder wegzunehmen, weil das Netz
weg ist, wäre die schlimmste Form von „es fällt".

## Prüfung

**Unit, ohne DOM:** die Formel an Randfällen — kleinstes und größtes Gitter,
alle drei Stufen, mit und ohne Fehlprüfung; die Stufenschwellen an ihren
Grenzen; dass Erfahrung über eine wachsende Ergebnisliste **monoton** steigt
und nie fällt.

**Worker:** die Schnittstelle summiert über alle Ergebnisse, nicht nur die
ersten hundert.

**e2e:** ein gelöstes Rätsel zeigt den Zugewinn im Dialog; ein Stufenaufstieg
nennt das Werkzeug; ohne Netz fehlt der Block, statt zu lügen; ein
freigeschaltetes Werkzeug überlebt einen Neustart ohne Verbindung.

**Layout:** Der Gelöst-Dialog wächst um einen Block. Er kommt in den
bestehenden Wächter — Tapflächen und kein Querlauf, auch bei 320 px, wo der
Dialog heute schon eng ist.

## Geltungsbereich

**Nicht dazu gehört:** Rangliste, Vergleich mit anderen, Verfall, tägliche
Ziele, Abzeichen, Kosmetik, Hinweis→Gitter-Verknüpfung (eigenes Vorhaben,
braucht den Generator).

**Unverändert:** Schema, Migrationen, Hosting, Sammlung, Tagesrätsel, Duell,
freies Spiel. Der Startbildschirm bekommt **nichts** dazu.
