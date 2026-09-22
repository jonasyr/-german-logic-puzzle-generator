# Angefangene Rätsel sichtbar machen — Entwurf

**Datum:** 2026-09-22
**Zweig:** `redesign/mobile-canvas-overview`
**Löst ab:** `docs/superpowers/specs/2026-09-21-angefangene-raetsel.md` (die offene Frageliste)

## Ziel

Man soll seinen Stand nie verlieren — und sehen, wo er liegt.

Heute weiß die App mehr, als sie zeigt. Markierungen liegen je Rätsel im
lokalen Speicher und überleben ein Neuladen. Sichtbar ist davon genau eine
Sache: der Knopf „Weiterspielen" auf dem Startbildschirm, und der zeigt auf
**ein** Rätsel. In der Sammlung ist jeder Eintrag entweder „gelöst" oder leer;
ein Kapitel mit drei angefangenen Rätseln sieht aus wie ein unberührtes.

## Was gemessen wurde, bevor entschieden wurde

Drei Befunde aus dem Code, die den Entwurf bestimmen:

**Der Speicherschlüssel ist nicht berechenbar.** Er lautet

```
logicals:play:${mode}:${room}:${player}:${puzzle.id}:${puzzle.seed}:${dimensions}:${clues}
```

und `clues` ist `fnv1a36(puzzle.clues.join('\0'))` — ein Hash der **erzeugten**
Hinweisliste. Die Sammlung kann ihn nicht bilden, ohne jedes Rätsel zu
erzeugen (gemessen 2,4 s für ein 5×5 schwer, mal 120 Einträge). Der Hash steht
dort aus einem Grund: gleiches Thema, gleicher Seed und gleiche Maße bei
anderer Schwierigkeit ergeben eine andere Hinweisliste, und `usedClues` liegt
als Indexliste vor — ohne den Hash zeigten durchgestrichene Hinweise auf ein
fremdes Rätsel. Der Schlüssel bleibt also, wie er ist.

**Der Seed steht im Schlüssel.** Er lässt sich herausschneiden, ohne den Wert
zu lesen. Damit ist „angefangen ja/nein" und die Zuordnung zu einem
Katalogeintrag ohne einen einzigen `JSON.parse` zu haben.

**Es gibt genau einen Fortsetzungs-Platz.** `logicals.resume.v1` ist global,
nicht je Spieler: `loadResume(playerId)` gibt `null` zurück, wenn der
gespeicherte Datensatz einem anderen Spieler gehört. Wer ein zweites Rätsel
anfängt, überschreibt ihn. Verloren ist damit nicht der Stand — der liegt
weiter unter seinem eigenen Schlüssel — sondern der Weg dorthin.

## Entscheidungen

| Frage | Entscheidung | Grund |
|-------|--------------|-------|
| Wie findet die Sammlung die Stände? | Schlüssel durchgehen, Seed aus dem Schlüssel | Einzige Variante ohne zweite Wahrheit und ohne Bruch bestehender Stände |
| Was zeigt der Fortschritt? | Anteil der sicheren Zuordnungen | Erreicht bei gelöst genau 100 %; jede andere Bezugsgröße nie |
| Wer räumt auf? | Obergrenze 200 je Spieler, ältester fällt | Sammlung braucht höchstens 120, gedeckelt werden nur gewürfelte Einmal-Rätsel |
| Was meint „Weiterspielen"? | Der jüngste Stand | Was der Knopf verspricht; und jeder Stand wird einzeln wieder erreichbar |

Verworfen wurde ein mitgeschriebener Index (`logicals.started.v1`): er wäre
eine zweite Wahrheit neben den Ständen selbst und driftete, sobald jemand den
Speicher leert oder in einem zweiten Tab spielt — die Sammlung zeigte dann
einen Balken für ein leeres Rätsel. Das Durchgehen kostet nichts, was sich
messen ließe: es sind Schlüssel einer Liste, keine Werte.

## Architektur

### Neu: `client/js/play/savedGames.js`

Kennt den Speicher, keinen Bildschirm. `storage` ist überall ein Parameter mit
`localStorage` als Vorgabe — so läuft alles davon in Vitest unter Node ohne
DOM, dieselbe Regel, unter der `opponentState.js` und `level.js` schon stehen.

```js
/**
 * Alle Einzelspiel-Stände dieses Spielers — nur aus den Schlüsseln gelesen.
 *
 * @param {number} playerId
 * @param {Storage} [storage]
 * @returns {Array<{ key: string, themeId: string, seed: number,
 *                   categoryCount: number, valuesPerCategory: number }>}
 */
export function listSavedGames(playerId, storage = localStorage) { /* … */ }

/**
 * Ein Stand, gelesen. `null`, wenn der Wert fehlt oder kaputt ist.
 *
 * @param {string} key
 * @param {Storage} [storage]
 * @returns {{ sure: number, total: number, savedAt: string|null,
 *             solved: boolean, marks: number, options: object|null,
 *             fingerprint: string|null, title: string|null,
 *             elapsedMs: number } | null}
 */
export function readSavedGame(key, storage = localStorage) { /* … */ }

/**
 * Der jüngste Stand, der weder gelöst noch leer ist.
 *
 * @returns {{ key: string, seed: number, options: object, fingerprint: string,
 *             title: string, elapsedMs: number, marks: number } | null}
 */
export function newestSavedGame(playerId, storage = localStorage) { /* … */ }

/**
 * Schneidet auf `limit` Stände zurück, ältester zuerst.
 *
 * @returns {number} wie viele entfernt wurden
 */
export function pruneSavedGames(playerId, limit = 200, storage = localStorage) { /* … */ }
```

Gefiltert wird auf `mode === 'solo'` und `room === 'none'`: ein Duell-Stand
gehört zu einem Raum, der längst abgelaufen sein kann, und hat in der Sammlung
nichts zu suchen.

### Geändert: `client/js/play/playState.js`

`save(state, elapsedMs)` bekommt einen dritten Parameter
`meta = { fingerprint, title }` und schreibt vier Felder mehr, damit ein Stand
für sich allein wiederherstellbar ist:

```js
localStorage.setItem(state.storageKey, JSON.stringify({
    marks: [...state.marks],
    auto: [...],
    usedClues: [...],
    elapsedMs, solved: state.solved, attemptKey: state.attemptKey,
    failedChecks: state.failedChecks, resultQueued: state.resultQueued,
    // Neu: ein Stand trägt sich selbst.
    options: state.context?.options ?? null,
    fingerprint: meta.fingerprint ?? null,
    title: meta.title ?? null,
    savedAt: new Date().toISOString(),
}));
```

Der Fingerabdruck wird in `playController` asynchron gebildet
(`puzzleFingerprint`) und ist beim ersten `save()` womöglich noch `null`. Das
ist unkritisch: er wird bei jedem weiteren Speichern nachgetragen, und ohne
ihn gilt der Stand als nicht fortsetzbar — dieselbe Regel, die `loadResume`
heute über `REQUIRED` durchsetzt.

### Entfällt: `client/js/play/resumeStore.js`

Der Knopf liest künftig `newestSavedGame(player.id)`. Einmaliger Umzug beim
Start, in `main.js`:

1. `logicals.resume.v1` lesen. Fehlt er, ist nichts zu tun.
2. Zeigt sein `storageKey` auf einen vorhandenen Stand, dessen `options`
   fehlen, werden `options`, `fingerprint`, `title` und `savedAt` dort
   eingetragen.
3. `logicals.resume.v1` löschen.

Ältere Stände, auf die kein Datensatz zeigte, bleiben lesbar und zeigen ihren
Balken — fortsetzbar werden sie, sobald man sie einmal anfasst. Das ist die
ehrliche Grenze des Umzugs, und sie kostet niemanden einen Stand.

### Geändert: `client/js/play/playController.js`

`rememberForResume` entfällt. Der Weg des Duell-Aufgebens (`#opponent-later`)
kopiert den Stand heute auf den Solo-Schlüssel **und** schreibt einen
Fortsetzungs-Datensatz; künftig nur noch das Kopieren, mit den vier Feldern
dabei. `pruneSavedGames` läuft einmal je `openPlay`, nicht bei jedem
Speichern — beim Markieren ist Rechenzeit teuer, beim Öffnen nicht.

## Der Fortschritt

`sicher` sind die Markierungen mit `yes`. Automatische Kreuze liegen in
`state.auto` und zählen nicht mit; `maybe` und `no` ebenso wenig — sie sind
Arbeit, aber keine Festlegung.

Die Bezugsgröße steht im Schlüssel. `dimensions` ist `Kategorien×Werte`, also

```
total = Werte · C(Kategorien, 2) = Werte · Kategorien · (Kategorien − 1) / 2
```

Ein 3×4 hat `4 · 3 = 12` sichere Zuordnungen, ein 5×5 deren `5 · 10 = 50`. Ein
gelöstes Rätsel steht damit genau auf 100 %.

## Was die Bildschirme zeigen

**Regel: höchstens eine Statuszeile je Eintrag.** Rangfolge gelöst →
angefangen → Neu-Hinweis. Wer angefangen hat, kennt die neue Hinweisart
bereits; die Zeile tritt zurück, statt sich danebenzudrängen.

### Kapitelansicht (`entryRow`)

```
1. 3×4 · leicht
   ✓ gelöst                          unverändert, keine Linie

3. 4×4 · leicht
   6 von 12 sicher                   .list-row__score
   ▔▔▔▔▔▔▁▁▁▁▁▁                      .chapter-meter, wie die Kapitelkarte

4. 4×4 · leicht                      unberührt: nur der Titel, wie heute

5. 4×4 · mittel
   Neu: „A liegt zwischen B und C"   .list-row__meta, nur solange unberührt
```

Kein Eintrag wächst um eine dritte Zeile. Gelöste Einträge bekommen **keine**
Linie: 100 % zu zeichnen sagt nichts, was der Haken nicht schon sagt.
Wiederverwendet werden `.chapter-meter` und `.chapter-meter__fill` — die
Sammlung führt diese Sprache bereits eine Ebene höher, es kommt also keine
neue hinzu.

### Kapitelübersicht (`chapterRow`)

Die vorhandene Zeile wächst um eine Angabe, die wegfällt, wenn sie null wäre:

```
Finale beim Street-Food-Festival
2 von 12 · 3 angefangen
▔▔▔▔▁▁▁▁▁▁▁▁
```

Der Balken bleibt der Gelöst-Balken. Bei 320 px ist zu messen, ob die Zeile
umbricht; wenn ja, wird daraus „2 von 12 · 3 offen". Gemessen wird, nicht
geschätzt.

### Startbildschirm

„Weiterspielen" führt auf `newestSavedGame`. Die Zeile darunter
(`#resume-detail`) nennt weiter Titel, Zeit und Markierungen — sie liest ihre
Angaben jetzt aus dem Stand statt aus dem Fortsetzungs-Datensatz.

## Fehlerfälle

| Fall | Verhalten |
|------|-----------|
| Privater Modus, Speicher gesperrt | `listSavedGames` gibt `[]` zurück; Sammlung sieht aus wie heute |
| Ein Wert ist kaputtes JSON | `readSavedGame` gibt `null`; der Eintrag gilt als unberührt |
| Stand ohne `options` (vor dem Umzug) | Balken ja, fortsetzen nein — er erscheint nicht als „Weiterspielen" |
| Speicher voll beim Schreiben | wie heute stillschweigend; `pruneSavedGames` beim nächsten Öffnen schafft Platz |
| Spielerwechsel | Der Filter trägt die Spielernummer; fremde Stände sind unsichtbar, nicht gelöscht |

## Tests

### Vitest (Node, eingehängter Speicher)

Eine Attrappe `{ getItem, setItem, removeItem, key, length }` reicht; ein
echtes `localStorage` gibt es dort nicht.

- Schlüssel zerlegen: Seed, Thema und Maße kommen richtig heraus; ein
  Duell-Schlüssel (`duel:ABC234`) wird nicht mitgezählt; ein fremder Spieler
  ebenso wenig.
- Sichere Zuordnungen: `yes` zählt, `no` und `maybe` nicht; `auto` liegt gar
  nicht in `marks`.
- Bezugsgröße: 3×4 → 12, 5×5 → 50.
- Jüngster Stand: gelöste und leere werden übersprungen; ohne `savedAt` gilt
  ein Stand als der älteste.
- Obergrenze: bei 201 Ständen fällt genau der älteste, und der jüngste bleibt.
- Nichts davon wirft: kaputtes JSON, fehlende Felder, gesperrter Speicher.

### e2e — der ganze Weg, nicht die Bausteine

Ein durchgehender Ablauf, weil die Fehler dieses Vorhabens zwischen den
Bausteinen liegen:

1. Sammlungsrätsel öffnen, drei sichere Zuordnungen setzen, zurück.
2. Kapitelansicht: der Eintrag zeigt „3 von 12 sicher" und eine Linie.
3. Kapitelübersicht: „0 von 12 · 1 angefangen".
4. Startbildschirm: „Weiterspielen" nennt dieses Rätsel.
5. Ein zweites Sammlungsrätsel anfangen: „Weiterspielen" meint jetzt das
   zweite — und das erste ist über die Sammlung unverändert erreichbar.
6. Das erste zu Ende lösen: Haken, keine Linie mehr, Kapitelübersicht zählt
   „1 von 12" und nennt kein „angefangen" mehr für diesen Eintrag.

Randfälle als eigene, kurze Tests: ein Stand aus dem Duell-Aufgeben erscheint
in der Sammlung; ein Spielerwechsel verbirgt fremde Stände; bei gesperrtem
Speicher bleibt die Sammlung bedienbar.

## Abnahme

- `npx tsc --noEmit` — Exit 0
- `rtk npm test` — alle Vitest grün
- `npx playwright test` — dreimal hintereinander dasselbe Ergebnis; ein
  Fehlschlag wird im JSON-Bericht nachgesehen, nicht der Zusammenfassung
  geglaubt
- Aufnahmen bei 320 und 390, hell und dunkel, von Kapitelübersicht und
  Kapitelansicht mit angefangenen Einträgen
- Dedizierte Prüfer auf diese Aufnahmen, Auftrag wie zuletzt: nur melden, was
  im Bild zu sehen ist
- Befunde sortieren in „echt", „Attrappe" und „erst messen". Was sich messen
  lässt, wird gemessen — die Reiterleiste wurde zuletzt als 33 px gemeldet und
  war 44.
- Die Aufnahmen selbst ansehen, nicht nur die Berichte lesen

## Nicht dazu gehört

- Ein Bildschirm, der alle Stände auflistet. Die Sammlung ist die Liste; für
  gewürfelte eigene Rätsel bleibt „Weiterspielen" der Weg.
- Stände über Geräte hinweg. Sie liegen lokal, und das bleibt so.
- Ein Prozentsatz an anderer Stelle als in der Kapitelansicht. Der
  Startbildschirm nennt Markierungen, nicht Prozente — zwei Maße für dieselbe
  Sache auf einem Weg wären genau die Unordnung, die es zu vermeiden gilt.
