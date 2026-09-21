# Das Duell wird gleichrangig — Implementierungsplan

> **Für agentische Ausführung:** ERFORDERLICHE UNTER-SKILL: `superpowers:subagent-driven-development` (empfohlen) oder `superpowers:executing-plans`, Aufgabe für Aufgabe. Die Schritte tragen Kästchen (`- [ ]`) zum Abhaken.

**Ziel:** Das Duell hört auf, das zweitklassige Geschwister des Einzelspiels zu sein — beim Abschluss, beim Warten auf den Gegner, beim Einstieg und beim Nachschlagen.

**Ansatz:** Vier Phasen, jede für sich lauffähig und ausrollbar. Keine Schemaänderung, keine Migration: alles Nötige steht bereits in der Raum-Antwort (`room.results`) und in den Ergebniszeilen. Die Reihenfolge ist bewusst nach aufsteigendem Risiko gewählt — Phase 1 fasst nur Darstellung an, Phase 2 den empfindlichsten Test der Suite.

**Technik:** Vanilla ES-Module, Canvas 2D, Vitest 4 (Node, ohne DOM), Playwright 1.55, Cloudflare Worker mit D1/Drizzle.

**Spec:** Kein eigenes Dokument — die Befunde stammen aus der Durchsicht vom 2026-09-21 und stehen unten unter „Ausgangslage" vollständig, damit ein Ausführender sie nicht aus einem Gesprächsverlauf rekonstruieren muss.

## Ausgangslage — was die Durchsicht ergab

Belegt an Aufnahmen (`shots/duell-03..05`) und am Code, nicht aus dem Gedächtnis:

1. **Der Duell-Abschluss ist schwächer als der Einzelspieler-Dialog.** Kein „Geschafft!", die Zeit klein statt groß, **kein Erfahrungsblock** (obwohl Erfahrung verdient und gespeichert wird), keine Markierungszahl. Der Primärknopf heißt „Neues Rätsel", führt aber zu `screen-start` — und seit der Umbenennung heißt der gemeinte Bildschirm ohnehin „Eigenes Rätsel".
2. **Wer noch spielt, erfährt nichts.** Ist der Gegner fertig, bleibt der eigene Bildschirm unverändert. `#duel-progress` überträgt nur `Gegner: N Felder gesetzt`.
3. **Duell erstellen liegt versteckt** auf dem Konfigurationsbildschirm („Eigenes Rätsel" → „Duell starten"). Wer duellieren will, muss erst einen Rätsel-Konfigurator öffnen.
4. **Head-to-head liegt zwei Ebenen tief** (Ergebnisse → Reiter Statistik → scrollen) unter derselben Überschrift wie die Einzelspieler-Zahlen.

## Bestehende Bausteine, auf die dieser Plan aufsetzt

Alle geprüft, alle vorhanden:

| Baustein | Ort | Was er liefert |
|---|---|---|
| `room.results` | Antwort von `getDuelRoom(code)` | `[{ playerId, displayName, outcome, elapsedMs, failedChecks }]` — **daran ist „Gegner fertig" erkennbar, ohne Schemaänderung** |
| `createProgressReporter({ room, player, onOpponent })` | `client/js/duel/progressReporter.js` | pollt den Raum alle 5 s, ruft `onOpponent(member)` |
| `loadExperience(playerId)` | `client/js/stats/experience.js` | `{ xp, solved } \| null`, wirft nicht |
| `cachedExperience(playerId)` | dito | letzter bekannter Stand oder `null` |
| `levelAt(xp)` | `client/js/stats/level.js` | `{ level, floor, next, intoLevel, levelSpan }` |
| `entryAfter(seed)` | `client/js/catalogue/catalogue.js` | `{ chapter, entry } \| null` |
| `playCatalogueEntry(chapter, entry)` | `client/js/screens/collectionScreen.js` | erzeugt und öffnet einen Katalogeintrag |
| `saveResume(record)` / `clearResume()` | `client/js/play/resumeStore.js` | Fortsetzungs-Datensatz |
| `createDuelForPuzzle({ player, options, puzzle, puzzleIndex })` | `client/js/duel/lobbyController.js` | vollständig generisch, **keine Annahme über den Seed-Bereich** |

## Globale Randbedingungen

- **Keine Schemaänderung, keine Migration.** Wenn eine Aufgabe eine zu brauchen scheint, ist sie falsch geschnitten — abbrechen und melden.
- **Kein `Co-Authored-By`**, keine KI-Signatur in Commits oder PR-Texten.
- Jeder Shell-Befehl mit `rtk` davor, auch in `&&`-Ketten.
- `npx tsc --noEmit` **direkt** ausführen und den Exit-Code prüfen — niemals durch `tail`/`grep`/Pipe, sonst verschwindet ein Fehlschlag spurlos.
- Vitest läuft in **Node ohne DOM**: Logik, die getestet werden soll, gehört in ein Modul ohne DOM-Zugriff.
- Die Aufnahmestrecken (`e2e/screenshots.spec.ts`, `e2e/duel-screenshots.spec.ts`) laufen nur mit `SHOTS=1` und prüfen nichts.
- **Attrappen müssen `publicResult` bzw. `publicRoom` spiegeln.** Drei Scheinfehler sind hier schon aus falschen Feldnamen entstanden (`solvedAt` statt `completedAt`, `title` statt `puzzleTitle`, zwei Antworten statt einer).
- Nach jeder Phase: voller Lauf (`rtk npm test`, `npx tsc --noEmit`, `npx playwright test`) **und** Aufnahmen neu, bevor abgenommen wird.

---

## Phase 1 — Der Duell-Abschluss auf Einzelspieler-Niveau

Kleinste Phase, reine Darstellung, kein Netz-Verhalten geändert. Eigenständig ausrollbar.

### Aufgabe 1.1: Der Knopf sagt, was er tut

**Dateien:**
- Ändern: `client/index.html` (Abschnitt `#screen-duel-result`)
- Test: `e2e/duel.spec.ts`

**Schnittstellen:**
- Liefert: nichts Neues; nur eine korrigierte Beschriftung.

- [ ] **Schritt 1: Den fehlerhaften Knopf im Test festnageln**

In `e2e/duel.spec.ts`, im Test `two devices load the same runtime puzzle …`, direkt nach der bestehenden Zeile `await expect(host.locator('#duel-result-list .duel-result-card')).toHaveCount(2, { timeout: 5_000 });`:

```ts
  /*
   * Der Knopf hiess "Neues Raetsel", fuehrte aber zu screen-start - und der
   * Bildschirm, den er zu meinen schien, heisst inzwischen "Eigenes Raetsel".
   * Ein Knopf, der etwas anderes verspricht als er tut.
   */
  const weiter = host.locator('#duel-result-home');
  await expect(weiter).toHaveText('Zur Startseite');
```

- [ ] **Schritt 2: Laufen lassen, Fehlschlag sehen**

```bash
cd logicals-site && npx playwright test duel.spec.ts -g "two devices" --reporter=line
```
Erwartet: FEHLSCHLAG, `#duel-result-home` nicht gefunden.

- [ ] **Schritt 3: Markup korrigieren**

In `client/index.html`, im Abschnitt `#screen-duel-result`, diese Zeile:

```html
            <button class="btn btn--primary btn--block" type="button" data-goto="screen-start">Neues Rätsel</button>
```

ersetzen durch:

```html
            <!-- Sagt, was er tut. Er hiess "Neues Rätsel" und führte zur
                 Startseite - und der Bildschirm, den er zu meinen schien,
                 heißt inzwischen "Eigenes Rätsel". -->
            <button class="btn btn--ghost btn--block" type="button" id="duel-result-home" data-goto="screen-start">Zur Startseite</button>
```

- [ ] **Schritt 4: Laufen lassen, grün sehen**

```bash
cd logicals-site && npx playwright test duel.spec.ts -g "two devices" --reporter=line
```
Erwartet: BESTANDEN.

- [ ] **Schritt 5: Festhalten**

```bash
cd logicals-site && rtk git add -A && rtk git commit -m "fix(duel): der Knopf im Abschluss sagt, was er tut"
```

### Aufgabe 1.2: Der Abschluss bekommt seinen Moment und die Erfahrung

**Dateien:**
- Ändern: `client/index.html` (`#screen-duel-result`)
- Ändern: `client/js/screens/duelResultScreen.js`
- Ändern: `client/js/duel/duelResultController.js`
- Ändern: `client/styles/components.css`
- Test: `e2e/duel.spec.ts`

**Schnittstellen:**
- Verbraucht: `loadExperience(playerId)`, `cachedExperience(playerId)`, `levelAt(xp)`.
- Liefert: `renderDuelExperience(standing)` in `duelResultScreen.js` mit
  `standing: { gain: number|null, xp: number, level: number, intoLevel: number, levelSpan: number } | null`
  — **exakt dieselbe Form wie `showSolvedExperience`** in `client/js/ui/solvedDialog.js`, damit beide Bildschirme dieselbe Sprache sprechen.

- [ ] **Schritt 1: Den fehlenden Block im Test fordern**

In `e2e/duel.spec.ts`, im selben Test, nach der Prüfung aus Aufgabe 1.1:

```ts
  /*
   * Erfahrung wird im Duell verdient - dasselbe Ergebnis, dieselbe Formel -
   * und war hier nie zu sehen. Sie wird nachgetragen, sobald der Stand da ist,
   * genau wie im Einzelspieler-Dialog; ohne Netz bleibt der Block weg, weil
   * eine falsche Zahl schlechter waere als keine.
   */
  await expect(host.locator('#duel-xp')).toBeVisible({ timeout: 20_000 });
  await expect(host.locator('#duel-xp-level')).toHaveText(/^Noch \d+ bis Stufe \d+$/);
```

Dazu in `e2e/support/duelServer.ts` die Erfahrungs-Abfrage bedienen (Feldnamen spiegeln `sumExperience`):

```ts
  await page.route('**/api/players/*/experience', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ xp: 845, solved: 21 }),
  }));
```

- [ ] **Schritt 2: Laufen lassen, Fehlschlag sehen**

```bash
cd logicals-site && npx playwright test duel.spec.ts -g "two devices" --reporter=line
```
Erwartet: FEHLSCHLAG, `#duel-xp` nicht sichtbar.

- [ ] **Schritt 3: Markup ergänzen**

In `client/index.html`, in `#screen-duel-result`, **vor** `<p class="hint" id="duel-result-hint" …>`:

```html
            <!-- Erfahrung: erscheint nachträglich, wenn der Stand da ist.
                 Derselbe Aufbau wie im Gelöst-Dialog - eine Zeile, ein Balken,
                 keine Kachel. Ohne Netz bleibt der Block weg. -->
            <div class="solved__xp" id="duel-xp" hidden>
                <p class="solved__xp-line">
                    <span class="solved__xp-gain" id="duel-xp-gain"></span>
                    <span class="solved__xp-level" id="duel-xp-level"></span>
                </p>
                <div class="solved__xp-track" aria-hidden="true">
                    <span class="solved__xp-fill" id="duel-xp-fill"></span>
                </div>
            </div>
```

Die Klassen sind bewusst dieselben wie im Gelöst-Dialog — ein zweiter Satz Regeln für dieselbe Sache wäre die Stelle, an der beide Bildschirme auseinanderlaufen.

- [ ] **Schritt 4: Darstellung ergänzen**

In `client/js/screens/duelResultScreen.js` am Ende anfügen:

```js
/**
 * Trägt den Erfahrungsstand nach, sobald er vorliegt.
 *
 * Gleiche Form und gleiche Regel wie showSolvedExperience im Einzelspiel:
 * ohne Stand bleibt der Block weg, weil eine falsche Zahl schlechter wäre als
 * keine. Der Zuwachs ist die Differenz zum gemerkten Stand - so muss die
 * Formel nicht auch im Client stehen.
 *
 * @param {{ gain: number|null, xp: number, level: number,
 *           intoLevel: number, levelSpan: number } | null} standing
 */
export function renderDuelExperience(standing) {
    const block = el('duel-xp');
    if (!standing) { block.hidden = true; return; }

    el('duel-xp-gain').textContent = standing.gain === null || standing.gain <= 0
        ? `${standing.xp} Erfahrung`
        : `+${standing.gain}`;
    const fehlt = Math.max(0, standing.levelSpan - standing.intoLevel);
    el('duel-xp-level').textContent = `Noch ${fehlt} bis Stufe ${standing.level + 1}`;

    const anteil = standing.levelSpan > 0
        ? Math.max(0, Math.min(1, standing.intoLevel / standing.levelSpan))
        : 0;
    el('duel-xp-fill').style.width = `${Math.round(anteil * 100)}%`;
    block.hidden = false;
}
```

- [ ] **Schritt 5: Verdrahten**

In `client/js/duel/duelResultController.js` oben ergänzen:

```js
import { renderDuelExperience } from '../screens/duelResultScreen.js';
import { cachedExperience, loadExperience } from '../stats/experience.js';
import { levelAt } from '../stats/level.js';
```

und in `poll(room, player)` unmittelbar nach `const complete = renderDuelResults(response.room, player.id);`:

```js
        /*
         * Einmal je Abschluss, nicht bei jedem Poll: der Stand aendert sich
         * nicht mehr, und jede Abfrage kostet auf dem Mobilfunk.
         */
        if (!experienceShown) {
            experienceShown = true;
            const vorher = cachedExperience(player.id);
            loadExperience(player.id).then(jetzt => {
                if (!jetzt) return;
                const stufe = levelAt(jetzt.xp);
                renderDuelExperience({
                    gain: vorher ? jetzt.xp - vorher.xp : null,
                    xp: jetzt.xp,
                    level: stufe.level,
                    intoLevel: stufe.intoLevel,
                    levelSpan: stufe.levelSpan,
                });
            }).catch(() => { /* ohne Stand bleibt der Block weg */ });
        }
```

Dazu neben `let timer = null;` ergänzen: `let experienceShown = false;` — und in `stop()` sowie beim Start eines neuen Duells auf `false` zurücksetzen, sonst zeigt das zweite Duell den Block gar nicht.

- [ ] **Schritt 6: Laufen lassen, grün sehen**

```bash
cd logicals-site && npx tsc --noEmit; echo "tsc=$?"
cd logicals-site && npx playwright test duel.spec.ts --reporter=line
```
Erwartet: `tsc=0`, alle Duell-Tests bestanden.

- [ ] **Schritt 7: Ansehen**

```bash
cd logicals-site && SHOTS=1 npx playwright test duel-screenshots --reporter=line
```
Dann `shots/duell-05-beide-fertig.png` lesen und prüfen: Erfahrungsblock sichtbar, Balken gefüllt, Knopf „Zur Startseite".

- [ ] **Schritt 8: Festhalten**

```bash
cd logicals-site && rtk git add -A && rtk git commit -m "feat(duel): der Abschluss zeigt die verdiente Erfahrung"
```

### Aufgabe 1.3: Weiterführung im Duell-Abschluss

**Dateien:**
- Ändern: `client/index.html` (`#screen-duel-result`)
- Ändern: `client/js/screens/duelResultScreen.js`
- Test: `e2e/duel.spec.ts`

**Schnittstellen:**
- Verbraucht: `entryAfter(seed)`, `playCatalogueEntry(chapter, entry)`.
- Liefert: nichts, worauf spätere Aufgaben bauen.

- [ ] **Schritt 1: Knopf ins Markup, verborgen**

Direkt **über** dem Knopf aus Aufgabe 1.1:

```html
            <!-- Nur bei Sammlungs-Rätseln. Im freien Spiel und beim Tagesrätsel
                 gibt es kein nächstes; dann bleibt der Knopf weg statt als
                 leere Versprechung ausgegraut dazustehen. -->
            <button class="btn btn--primary btn--block" type="button" id="duel-result-next" hidden>Nächstes Rätsel</button>
```

- [ ] **Schritt 2: In `renderDuelResults` verdrahten**

In `client/js/screens/duelResultScreen.js`, am Ende von `renderDuelResults` **vor** dem `return`:

```js
    /*
     * Weiter statt hinaus - dieselbe Regel wie im Gelöst-Dialog. Woher das
     * Rätsel kam, muss der Raum sich nicht merken: der Seed steht in seinen
     * Angaben, und der Katalog weiß den Rest.
     */
    const folgend = entryAfter(room.effectivePuzzleSeed);
    const next = el('duel-result-next');
    next.hidden = !folgend;
    next.onclick = folgend
        ? () => playCatalogueEntry(folgend.chapter, folgend.entry)
        : null;
```

Dazu oben importieren:

```js
import { entryAfter } from '../catalogue/catalogue.js';
import { playCatalogueEntry } from './collectionScreen.js';
```

- [ ] **Schritt 3: Prüfen, dass es im freien Spiel wegbleibt**

In `e2e/duel.spec.ts`, im bestehenden Test (der ein freies Rätsel erzeugt):

```ts
  // Freies Spiel: es gibt kein naechstes Raetsel im Katalog.
  await expect(host.locator('#duel-result-next')).toBeHidden();
```

- [ ] **Schritt 4: Voller Lauf**

```bash
cd logicals-site && npx tsc --noEmit; echo "tsc=$?"
cd logicals-site && rtk npm test 2>&1 | tail -5
cd logicals-site && npx playwright test --reporter=line 2>&1 | tail -3
```
Erwartet: `tsc=0`, alle Vitest-Tests grün, alle e2e grün.

- [ ] **Schritt 5: Festhalten**

```bash
cd logicals-site && rtk git add -A && rtk git commit -m "feat(duel): aus dem Abschluss fuehrt ein Weg zum naechsten Raetsel"
```

---

## Phase 2 — Wer noch spielt, erfährt es

Die wertvollste Phase und die riskanteste: sie fasst `duel.spec.ts` an, den schwersten Test der Suite (gemessen 28,8 s allein, 31,4–36,2 s im Verbund). **Nicht schnell machen.**

### Aufgabe 2.1: Die Erkennung als reine Funktion

**Dateien:**
- Erstellen: `client/js/duel/opponentState.js`
- Test: `test/opponent-state.test.ts`

**Schnittstellen:**
- Liefert: `opponentFinish(room, playerId)` → `{ displayName: string, elapsedMs: number } | null`

Bewusst ohne DOM, damit Vitest sie in Node prüfen kann — die Regel steht in den globalen Randbedingungen.

- [ ] **Schritt 1: Test schreiben**

`test/opponent-state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { opponentFinish } from '../client/js/duel/opponentState.js';

/*
 * Wer noch spielt, erfuhr nicht, dass der andere fertig ist - der Bildschirm
 * blieb unveraendert. Erkennbar ist es ohne Schemaaenderung: die Raum-Antwort
 * traegt bereits `results`, und ein Eintrag des anderen Spielers heisst
 * "fertig".
 */
const raum = (results: unknown[]) => ({ results });

describe('Gegner fertig', () => {
  it('meldet den Gegner, sobald sein Ergebnis da ist', () => {
    const treffer = opponentFinish(
      raum([{ playerId: 2, displayName: 'Bea', elapsedMs: 61_000, failedChecks: 0 }]), 1);
    expect(treffer).toEqual({ displayName: 'Bea', elapsedMs: 61_000 });
  });

  it('schweigt, solange nur das eigene Ergebnis da ist', () => {
    expect(opponentFinish(
      raum([{ playerId: 1, displayName: 'Ada', elapsedMs: 50_000, failedChecks: 1 }]), 1)).toBeNull();
  });

  it('schweigt ohne Ergebnisse', () => {
    expect(opponentFinish(raum([]), 1)).toBeNull();
    expect(opponentFinish({}, 1)).toBeNull();
  });
});
```

- [ ] **Schritt 2: Laufen lassen, Fehlschlag sehen**

```bash
cd logicals-site && npx vitest run --root . test/opponent-state.test.ts
```
Erwartet: FEHLSCHLAG, Modul nicht gefunden.

- [ ] **Schritt 3: Umsetzen**

`client/js/duel/opponentState.js`:

```js
/**
 * Ob der Gegner fertig ist — und wie schnell.
 *
 * Ohne Schemaänderung erkennbar: die Raum-Antwort trägt bereits `results`,
 * und ein Eintrag mit fremder Spielernummer heißt, dass dort jemand
 * abgegeben hat. Eine eigene Spalte „finishedAt" wäre eine Migration für
 * eine Auskunft, die schon dasteht.
 *
 * @param {{ results?: Array<{ playerId: number, displayName: string, elapsedMs: number }> }} room
 * @param {number} playerId
 * @returns {{ displayName: string, elapsedMs: number } | null}
 */
export function opponentFinish(room, playerId) {
    const treffer = (room?.results ?? []).find(result => result.playerId !== playerId);
    if (!treffer) return null;
    return { displayName: treffer.displayName, elapsedMs: treffer.elapsedMs };
}
```

- [ ] **Schritt 4: Laufen lassen, grün sehen**

```bash
cd logicals-site && npx vitest run --root . test/opponent-state.test.ts
```
Erwartet: 3 Tests bestanden.

- [ ] **Schritt 5: Festhalten**

```bash
cd logicals-site && rtk git add -A && rtk git commit -m "feat(duel): erkennt am Raum, ob der Gegner fertig ist"
```

### Aufgabe 2.2: Der Melder reicht den Raum durch

**Dateien:**
- Ändern: `client/js/duel/progressReporter.js`
- Test: `test/duel-client.test.ts`

**Schnittstellen:**
- Verbraucht: nichts Neues.
- Liefert: `createProgressReporter({ room, player, onOpponent, onRoom })` — `onRoom(room)` bekommt bei jedem Poll die **ganze** Raum-Antwort. `onOpponent` bleibt unverändert, damit bestehende Aufrufer nicht brechen.

- [ ] **Schritt 1: Erweitern**

In `client/js/duel/progressReporter.js`, Signatur und Poll anpassen:

```js
export function createProgressReporter({ room, player, onOpponent, onRoom }) {
```

und in `tick()` nach `const response = await getDuelRoom(room.code);`:

```js
            // Der ganze Raum, nicht nur das Mitglied: "fertig" steht in
            // response.room.results, nicht in den Mitgliedsangaben.
            if (!stopped) onRoom?.(response.room);
```

- [ ] **Schritt 2: Voller Lauf**

```bash
cd logicals-site && npx tsc --noEmit; echo "tsc=$?"
cd logicals-site && rtk npm test 2>&1 | tail -4
```
Erwartet: `tsc=0`, alle Tests grün (`onRoom` ist optional, nichts bricht).

- [ ] **Schritt 3: Festhalten**

```bash
cd logicals-site && rtk git add -A && rtk git commit -m "refactor(duel): der Fortschrittsmelder reicht den ganzen Raum durch"
```

### Aufgabe 2.3: Die Meldung und die Wahl

**Dateien:**
- Ändern: `client/index.html` (neuer Dialog `#opponent-dialog`)
- Ändern: `client/js/play/playController.js`
- Ändern: `client/styles/components.css` (nur falls der bestehende `.confirm`-Satz nicht reicht)
- Test: `e2e/duel.spec.ts`

**Schnittstellen:**
- Verbraucht: `opponentFinish(room, playerId)`, `saveResume(record)`, `showScreen('screen-start')`.
- Liefert: nichts, worauf spätere Aufgaben bauen.

**Verhalten, ausformuliert** (damit niemand raten muss):

Sobald `opponentFinish` erstmals etwas liefert, erscheint **einmalig** ein Dialog:

> **Bea ist fertig** — in 1:01.
> Du kannst weiterspielen; deine Zeit zählt trotzdem.
> [ Weiterspielen ] [ Später beenden ]

„Weiterspielen" schließt nur. „Später beenden" schreibt einen Fortsetzungs-Datensatz und geht zur Startseite — dort steht das Rätsel dann unter „Weiterspielen" wie ein Einzelspiel.

**Warum ein Datensatz nötig ist:** `rememberForResume` in `playController.js` steigt bei `mode !== 'solo'` sofort aus — ein Duell schreibt heute **nie** eine Fortsetzung. Ohne diesen Schritt führt „Später beenden" ins Nichts.

- [ ] **Schritt 1: Markup**

In `client/index.html`, neben den übrigen `<dialog class="confirm">`:

```html
    <!-- Wer noch spielt, erfährt, dass der andere fertig ist - und entscheidet
         selbst. Vorher blieb der Bildschirm unverändert, und man spielte
         weiter, ohne zu wissen, dass das Rennen entschieden war. -->
    <dialog class="confirm" id="opponent-dialog" aria-labelledby="opponent-title">
        <h3 class="confirm__title" id="opponent-title"></h3>
        <p class="confirm__text">Du kannst weiterspielen – deine Zeit zählt trotzdem.</p>
        <form method="dialog" class="confirm__actions">
            <button class="btn btn--ghost" type="submit" value="later" id="opponent-later">Später beenden</button>
            <button class="btn btn--primary" type="submit" value="stay" id="opponent-stay" autofocus>Weiterspielen</button>
        </form>
    </dialog>
```

- [ ] **Schritt 2: Verdrahten**

In `client/js/play/playController.js`, im `createProgressReporter`-Aufruf `onRoom` ergänzen:

```js
            onRoom: room => {
                /*
                 * Einmalig. Der Raum meldet den Abschluss bei jedem Poll
                 * weiter; ein Dialog, der alle fuenf Sekunden wiederkommt,
                 * waere schlimmer als gar keiner.
                 */
                if (opponentAnnounced) return;
                const fertig = opponentFinish(room, state.context.player.id);
                if (!fertig) return;
                opponentAnnounced = true;
                announceOpponent(fertig);
            },
```

Dazu neben den übrigen Modulvariablen `let opponentAnnounced = false;` und im `openPlay`-Pfad auf `false` zurücksetzen. Und die Funktion:

```js
/** Meldet den fertigen Gegner und lässt den Spieler entscheiden. */
function announceOpponent({ displayName, elapsedMs }) {
    el('opponent-title').textContent = `${displayName} ist fertig – in ${formatTime(elapsedMs)}`;
    const dialog = el('opponent-dialog');
    el('opponent-later').onclick = () => {
        /*
         * Aus dem Duell wird ein Einzelspiel zum Weitermachen.
         * rememberForResume steigt bei mode !== 'solo' aus, also wird der
         * Datensatz hier ausdruecklich geschrieben - sonst fuehrte "Spaeter
         * beenden" ins Nichts.
         */
        saveResume({
            options: state.context.options,
            puzzleIndex: state.context.puzzleIndex ?? 0,
            fingerprint: puzzleFingerprint,
            storageKey: state.storageKey,
            playerId: state.context.player.id,
            title: `${state.puzzle.number}. ${state.puzzle.title}`,
            savedAt: new Date().toISOString(),
            elapsedMs: timer ? timer.elapsedMs() : 0,
            markCount: state.marks.size,
        });
        showScreen('screen-start');
    };
    if (typeof dialog.showModal === 'function') dialog.showModal();
}
```

`opponentFinish` und `saveResume` oben importieren.

- [ ] **Schritt 3: Test**

In `e2e/duel.spec.ts` ein **eigener** Test (nicht den schweren erweitern — er ist bereits am Limit):

```ts
test('wer noch spielt, erfaehrt dass der andere fertig ist', async ({ browser }) => {
  test.setTimeout(180_000);
  // Aufbau wie im bestehenden Duell-Test bis beide im Spiel sind, dann:
  await solve(host);
  // Der Melder pollt alle 5 s - hier grosszuegig warten.
  await expect(guest.locator('#opponent-dialog')).toBeVisible({ timeout: 30_000 });
  await expect(guest.locator('#opponent-title')).toContainText('Ada ist fertig');

  await guest.locator('#opponent-later').click();
  await expect(guest.locator('#screen-start')).toHaveClass(/is-active/);
  // Und das Raetsel steht als Fortsetzung bereit, wie nach einem Einzelspiel.
  await expect(guest.locator('#resume-button')).toBeVisible();
});
```

- [ ] **Schritt 4: Voller Lauf, dreimal**

```bash
cd logicals-site && npx tsc --noEmit; echo "tsc=$?"
cd logicals-site && for i in 1 2 3; do npx playwright test duel.spec.ts --reporter=line 2>&1 | tail -1; done
```
Erwartet: dreimal dasselbe Ergebnis. **Flattert es, nicht weitermachen** — dieser Test war in diesem Projekt schon einmal der Flatterfall, und die Ursache war beide Male eine fehlende Zeitgrenze oder ein Rennen, nicht Zufall.

- [ ] **Schritt 5: Ansehen**

```bash
cd logicals-site && SHOTS=1 npx playwright test duel-screenshots --reporter=line
```
`shots/duell-04-gast-spielt-noch.png` muss jetzt den Dialog zeigen — vorher war dort **nichts**.

- [ ] **Schritt 6: Festhalten**

```bash
cd logicals-site && rtk git add -A && rtk git commit -m "feat(duel): wer noch spielt, erfaehrt dass der andere fertig ist"
```

---

## Phase 3 — Ein Einstieg für das Duell

### Aufgabe 3.1: Der Duell-Bildschirm

**Dateien:**
- Ändern: `client/index.html` (`#screen-duel-entry` wird zu `#screen-duel` mit zwei Wegen)
- Ändern: `client/js/main.js` (Startknopf zeigt auf den neuen Bildschirm)
- Ändern: `client/index.html` (`#duel-start-button` verlässt `#screen-config`)
- Test: `e2e/navigation.spec.ts`, `e2e/duel.spec.ts`

**Schnittstellen:**
- Verbraucht: `createDuelForPuzzle({ player, options, puzzle, puzzleIndex })`, `optionsFor(chapter, entry)`, `fetchBooklet(options)`.
- Liefert: nichts, worauf spätere Aufgaben bauen.

**Aufbau des Bildschirms:**

```
‹ Zurück        Duell

[ Duell starten ]          ← primär
  Sammlung · Tagesrätsel · Eigenes

Mit Code beitreten
[ A B C 1 2 3 ]
[ Beitreten ]
```

- [ ] **Schritt 1: Den Weg im Test festnageln**

In `e2e/navigation.spec.ts`:

```ts
test('Duell ist ein eigener Weg, kein Anhaengsel des Konfigurators', async ({ page }) => {
  await withPlayer(page);
  await page.goto('/');
  await page.locator('#duel-join-button').click();
  // Beide Wege stehen hier, nicht nur einer.
  await expect(page.locator('#duel-create')).toBeVisible();
  await expect(page.locator('#duel-entry-submit')).toBeVisible();
  // Und der Konfigurator traegt ihn nicht mehr.
  await page.goBack();
  await page.locator('#start-button').click();
  await expect(page.locator('#duel-start-button')).toHaveCount(0);
});
```

- [ ] **Schritt 2 bis 6:** Markup umbauen, `duel-start-button` aus `#screen-config` entfernen, Quellenauswahl als Liste mit drei Einträgen, Router-Eintrag, `main.js` anpassen. Nach jedem Teilschritt `npx tsc --noEmit` **direkt** prüfen.

- [ ] **Schritt 7: Voller Lauf und Aufnahmen**

```bash
cd logicals-site && npx tsc --noEmit; echo "tsc=$?"
cd logicals-site && rtk npm test 2>&1 | tail -4
cd logicals-site && npx playwright test --reporter=line 2>&1 | tail -3
cd logicals-site && rm -f shots/*.png && SHOTS=1 npx playwright test screenshots duel-screenshots --reporter=line
```

- [ ] **Schritt 8: Festhalten**

```bash
cd logicals-site && rtk git add -A && rtk git commit -m "feat(duel): ein eigener Einstieg mit Quellenauswahl"
```

### Aufgabe 3.2: Sammlungsrätsel als Wettlauf

**Dateien:**
- Ändern: der Bildschirm aus 3.1
- Test: `e2e/duel.spec.ts`

**Schnittstellen:**
- Verbraucht: `chapters()`, `nextOpen(chapter, solved)`, `optionsFor(chapter, entry)`, `fetchBooklet`, `createDuelForPuzzle`.

Technisch trivial — `createDuelForPuzzle` trifft **keine Annahme über den Seed-Bereich**, und ein im Duell gelöstes Sammlungsrätsel zählt automatisch für **beide** Sammlungen, weil `listSolvedSeeds` nur nach Seed filtert, nicht nach Raum. Das ist zu prüfen, nicht zu bauen:

- [ ] **Schritt 1: Genau das im Test festhalten**

```ts
test('ein im Duell geloestes Sammlungsraetsel zaehlt fuer beide Sammlungen', async ({ browser }) => {
  test.setTimeout(180_000);
  // Beide loesen dasselbe Katalog-Raetsel im Duell, dann:
  for (const page of [host, guest]) {
    await page.goto('/');
    await page.locator('#collection-button').click();
    await expect(page.locator('.chapter-row').first()).toContainText('1 von 12');
  }
});
```

- [ ] **Schritte 2–4:** Quelle „Sammlung" verdrahten, voller Lauf, festhalten.

---

## Phase 4 — Head-to-head sichtbarer

### Aufgabe 4.1: Duelle bekommen einen eigenen Reiter

**Dateien:**
- Ändern: `client/index.html` (`#screen-history`: dritter Reiter)
- Ändern: `client/js/screens/historyScreen.js`
- Ändern: `client/js/screens/statsScreen.js` (`duelSection` zieht um)
- Test: `e2e/daily-and-stats.spec.ts`

**Begründung:** Head-to-head liegt heute zwei Ebenen tief und unter derselben Überschrift wie die Einzelspieler-Zahlen. Ein eigener Reiter neben „Rätsel" und „Statistik" macht ihn zu einem Ort statt zu einer Fußnote.

**Achtung, Rückfall-Risiko:** Der Reiterstreifen trägt `segmented--even`, was die Breite gleichmäßig verteilt. Bei **drei** Reitern muss geprüft werden, dass die Beschriftungen bei 320 px nicht umbrechen — „Statistik" ist das längste Wort. Falls doch: kürzere Namen wählen, **nicht** die Gleichverteilung aufgeben.

- [ ] **Schritt 1: Test**

```ts
test('Duelle haben einen eigenen Reiter', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await withPlayer(page, STATS_HISTORY);
  await page.goto('/');
  await page.locator('#history-button').click();
  await page.locator('#history-tab-duels').click();
  await expect(page.locator('#duels-body')).toContainText('Gegen Bo');
  // Drei Reiter duerfen bei 320px nicht umbrechen.
  expect(await hasHorizontalScroll(page)).toBe(false);
  expect(await findUndersizedControls(page)).toEqual([]);
});
```

- [ ] **Schritte 2–5:** Reiter ergänzen, `duelSection` aus `personalSection` lösen, voller Lauf, festhalten.

---

## Abnahme — gilt für alle Phasen

Erst danach gilt etwas als fertig.

- [ ] `npx tsc --noEmit` **direkt**, Exit-Code 0
- [ ] `rtk npm test` — alle Vitest-Tests grün
- [ ] `npx playwright test` — alle e2e grün, **dreimal hintereinander** dasselbe Ergebnis
- [ ] `rm -f shots/*.png && SHOTS=1 npx playwright test screenshots duel-screenshots`
- [ ] **Dedizierte Prüfer** auf die Aufnahmen ansetzen: je einer für 320 hell+dunkel, 390 hell+dunkel, Querformat+Erstbesuch, Duell-Ablauf. Auftrag: schlecht gelaunter, sehr kritischer UX/UI/User-Flow-Prüfer, der nur Fehlerfreies durchwinkt; nur berichten, was im Bild wirklich zu sehen ist; „Flammku/chen" ist ein bekanntes Testbrowser-Artefakt und **nicht** zu melden.
- [ ] Befunde einsortieren: was davon ist ein App-Fehler, was ein Fehler der Attrappe? **Drei Scheinfehler sind hier schon aus falschen Feldnamen entstanden** — im Zweifel messen, nicht glauben.
- [ ] Die Aufnahmen selbst ansehen, nicht nur die Berichte lesen.
