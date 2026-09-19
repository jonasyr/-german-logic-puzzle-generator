# UX-Überarbeitung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Die sieben belegten UX-Befunde beheben, ohne dabei neue Layout-Fehler einzuführen.

**Architecture:** Ein automatischer Layout-Wächter geht allem voraus und wird von jeder folgenden Aufgabe aufgerufen. Danach entfällt der Heft-Bildschirm (was die Sackgasse mitlöst), das Zurück wird kontextabhängig und an die System-Geste angeschlossen, und Einstellungen, Einführung sowie Ergebnisse werden dorthin geräumt, wo man sie sucht.

**Tech Stack:** Vanilla ES-Module, Canvas 2D, Pointer Events, Vitest 4 (Node-Umgebung, **kein DOM**), Playwright 1.55.

**Spec:** `docs/superpowers/specs/2026-09-19-ux-overhaul-design.md`

## Global Constraints

- Nur `logicals-site/client/` und die zugehörigen Tests. **Die Bäume `webapp/` und `src/engine/` sind eine ältere Generation derselben App und werden nicht angefasst** (belegt: `webapp/js/play/playController.openPlay` hat In-Grad 0).
- Keine Änderung an Worker, D1, Drizzle-Migrationen oder Hosting.
- Speicherschlüssel bleiben byte-identisch: `storageKeyFor` (aus `fnv1a36`), `logicals.prefs.v1`, `logicals.players.v1`, `logicals.resume.v1`. Sonst verwaisen laufende Spiele.
- Unit-Tests laufen in **Node ohne DOM**. Client-Verhalten wird entweder über Playwright geprüft oder über Quelltext-Zusicherungen nach dem Muster von `test/app-shell.test.ts`.
- Oberflächentexte auf Deutsch, Du-Form, wie im Bestand.
- Commit-Nachrichten enthalten **keine** `Co-Authored-By:`-Zeile und keinerlei KI-Hinweis.
- Alle Shell-Befehle mit `rtk` präfixen, auch in `&&`-Ketten.
- Mindest-Tapfläche 44 × 44 pt (`var(--tap-min)`).

## Dateistruktur

| Datei | Verantwortung | Aufgabe |
|---|---|---|
| `e2e/support/layoutGuard.ts` | **neu** — die vier Layout-Invarianten als wiederverwendbare Prüfungen | 1 |
| `e2e/layout-guard.spec.ts` | **neu** — wendet sie an und belegt am gepflanzten Verstoß, dass sie greifen | 1 |
| `client/js/screens/resultScreen.js` | **entfällt** | 2 |
| `client/js/screens/configScreen.js` | nur noch Rätsel-Parameter | 2, 5 |
| `client/js/main.js` | Verdrahtung | 2, 3, 5, 6 |
| `client/js/router.js` | Bildschirmwechsel + History + Fokus | 3, 4 |
| `client/js/play/playController.js` | Rückweg, Legende, entwaffneter Zustand | 3, 4 |
| `client/js/screens/settingsScreen.js` | **neu** — Spiel-Vorlieben | 5 |
| `client/js/screens/historyScreen.js` | beide Reiter | 6 |
| `client/js/screens/statsScreen.js` | rendert in den Reiter | 6 |
| `client/js/ui/firstRun.js` | **neu** — einmalige Einführung | 7 |

## Reihenfolge und Begründung

Aufgabe 1 zuerst, weil jede folgende Aufgabe Layout anfasst. Aufgabe 2 vor 3, weil das Entfernen des Hefts die Hälfte der Rückweg-Frage beantwortet. Aufgabe 4 nach 3, weil die System-Geste den Duell-Rückfragedialog aus Aufgabe 3 respektieren muss.

---

### Task 1: Layout-Wächter

Die Bedingung des Auftraggebers: keine neuen UX-Fehler, namentlich kein Text über dem Gitter. Diese Aufgabe macht daraus eine Prüfung statt eines Vorsatzes.

Der Kern ist `document.elementFromPoint`. Eine Zelle gilt als verdeckt, wenn der Punkt in ihrer Mitte ein anderes Element liefert. Das unterscheidet von allein das Richtige: `elementFromPoint` überspringt Elemente mit `pointer-events: none`, also fallen die bewussten Overlays (`.play-status`, `.overview-minimap` — beide tragen es bereits) nicht auf, während jedes Element, das einen Tipp wirklich schluckt, sofort auffällt.

**Files:**
- Create: `e2e/support/layoutGuard.ts`
- Create: `e2e/layout-guard.spec.ts`

**Interfaces:**
- Produces:
  - `PHONES: { name: string; viewport: { width: number; height: number } }[]`
  - `CELL_SELECTORS: { overview: '.overview-mirror__cell'; pager: '.cell' }`
  - `findOccludedCells(page: Page, selector: string): Promise<Occlusion[]>` mit `Occlusion = { index: number; label: string; covering: string }`
  - `findUndersizedControls(page: Page): Promise<{ id: string; width: number; height: number }[]>`
  - `hasHorizontalScroll(page: Page): Promise<boolean>`
  - `gridRect(page: Page, selector: string): Promise<{ x: number; y: number; width: number; height: number }>`
  - `expectStableGrid(page: Page, selector: string, action: () => Promise<void>): Promise<void>`
  - `openSoloPuzzle(page: Page): Promise<void>` — der gemeinsame Weg bis ins Spiel, damit die folgenden Aufgaben ihn nicht je neu schreiben

- [ ] **Step 1: Schreibe den Wächter**

`e2e/support/layoutGuard.ts`:

```ts
import { expect, type Page } from '@playwright/test';

/*
 * Die Layout-Invarianten dieser App, an einem Ort.
 *
 * Die Statuszeile des Spielbildschirms war zweimal falsch platziert, bevor sie
 * sass - einmal ueber den Spaltenkoepfen, einmal mitten im Gitter im Querformat.
 * Beide Male waren alle Tests gruen. Was gefehlt hat, war nicht Sorgfalt,
 * sondern eine Pruefung.
 */

export const PHONES = [
  { name: 'iPhone mini', viewport: { width: 375, height: 812 } },
  { name: 'iPhone', viewport: { width: 390, height: 844 } },
  { name: 'iPhone quer', viewport: { width: 844, height: 390 } },
];

/** Die beiden Ansichten legen ihre antippbaren Zellen unterschiedlich ab. */
export const CELL_SELECTORS = {
  overview: '.overview-mirror__cell',
  pager: '.cell',
};

export type Occlusion = { index: number; label: string; covering: string };

/**
 * Zellen, deren Mittelpunkt ein anderes Element liefert.
 *
 * `elementFromPoint` respektiert `pointer-events: none`. Ein Hinweis, der
 * absichtlich ueber dem Gitter schwebt, traegt das und wird uebersprungen; ein
 * Element, das einen Tipp schluckt, traegt es nicht und faellt auf. Genau diese
 * Grenze ist die, die den Spieler interessiert.
 */
export async function findOccludedCells(page: Page, selector: string): Promise<Occlusion[]> {
  return page.evaluate((sel) => {
    const describe = (node: Element | null): string => {
      if (!node) return 'nichts (ausserhalb des Fensters)';
      const id = node.id ? `#${node.id}` : '';
      const cls = typeof node.className === 'string' && node.className
        ? `.${node.className.trim().split(/\s+/).join('.')}` : '';
      return `${node.tagName.toLowerCase()}${id}${cls}`;
    };

    const found: { index: number; label: string; covering: string }[] = [];
    [...document.querySelectorAll(sel)].forEach((cell, index) => {
      const rect = cell.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;      // unsichtbar: nicht unsere Frage
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      // Ausserhalb des Fensters ist Sache des Scrollens, nicht der Verdeckung.
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return;
      const top = document.elementFromPoint(x, y);
      if (top === cell || cell.contains(top)) return;
      found.push({
        index,
        label: cell.getAttribute('aria-label') ?? (cell.textContent ?? '').trim(),
        covering: describe(top),
      });
    });
    return found;
  }, selector);
}

/** Sichtbare Bedienelemente unter der Tapflaeche von 44 pt. */
export async function findUndersizedControls(page: Page) {
  return page.locator('.screen.is-active button:visible').evaluateAll(nodes => nodes
    .map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.id || node.className, width: rect.width, height: rect.height };
    })
    .filter(({ width, height }) => width < 44 || height < 44));
}

export async function hasHorizontalScroll(page: Page): Promise<boolean> {
  return page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
}

export async function gridRect(page: Page, selector: string) {
  return page.locator(selector).evaluate(node => {
    const { x, y, width, height } = node.getBoundingClientRect();
    return { x, y, width, height };
  });
}

/**
 * Belegt, dass eine Aktion das Gitter nicht verschiebt oder skaliert.
 *
 * Erscheinender Text, der Layout beansprucht, loest im Spielbildschirm den
 * ResizeObserver aus und wirft den Zoom des Spielers weg. Das ist der zweite
 * Weg, auf dem "Text ueber dem Gitter" weh tut - nicht durch Verdecken,
 * sondern durch Verdraengen.
 */
export async function expectStableGrid(page: Page, selector: string, action: () => Promise<void>) {
  const before = await gridRect(page, selector);
  await action();
  const after = await gridRect(page, selector);
  expect(after, 'die Aktion hat das Gitter verschoben oder skaliert').toEqual(before);
}

/** Der Weg von der Startseite bis in ein laufendes Solo-Spiel. */
export async function openSoloPuzzle(page: Page) {
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
  await page.route('**/api/players**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-17T00:00:00Z' }] }),
  }));
  await page.route('**/api/players/*/results**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));

  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#start-button').click();
  await page.locator('#field-categoryCount').selectOption('4');
  await page.locator('#field-valuesPerCategory').selectOption('4');
  await page.locator('#field-difficulty').selectOption('leicht');
  await page.locator('#generate-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#overview-canvas')).toBeVisible();
}
```

> **Hinweis an den Umsetzenden:** `openSoloPuzzle` drückt `#generate-button` und erwartet danach **unmittelbar** den Spielbildschirm. Vor Aufgabe 2 landet man aber noch auf dem Heft. Schreibe die Hilfsfunktion trotzdem heute schon so, wie sie nach Aufgabe 2 richtig ist, und überbrücke sie in Aufgabe 1 mit dem Zwischenschritt unten. Schritt 2 von Aufgabe 2 entfernt die Überbrückung wieder.

Ergänze `openSoloPuzzle` vorläufig direkt vor der letzten Zusicherung:

```ts
  // ENTFAELLT MIT AUFGABE 2: der Heft-Zwischenschritt.
  const heft = page.locator('#puzzle-list .puzzle button:has-text("Spielen")');
  if (await heft.count()) await heft.first().click();
```

- [ ] **Step 2: Schreibe den Test, der den Wächter selbst prüft**

`e2e/layout-guard.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import {
  CELL_SELECTORS, PHONES, expectStableGrid, findOccludedCells,
  findUndersizedControls, hasHorizontalScroll, openSoloPuzzle,
} from './support/layoutGuard';

for (const phone of PHONES) {
  test(`${phone.name}: nichts verdeckt das Gitter`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(phone.viewport);
    await openSoloPuzzle(page);

    expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);
    expect(await findUndersizedControls(page)).toEqual([]);
    expect(await hasHorizontalScroll(page)).toBe(false);

    // Und in der Einzelansicht, die ihre Zellen anders ablegt.
    await page.locator('#play-view').click();
    await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
    expect(await findOccludedCells(page, CELL_SELECTORS.pager)).toEqual([]);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
}

test('eine erscheinende Meldung verschiebt das Gitter nicht', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(PHONES[1].viewport);
  await openSoloPuzzle(page);

  await expectStableGrid(page, '#overview-viewport', async () => {
    // "Pruefen" auf leerem Gitter braucht keine Rueckfrage und schreibt sofort
    // in die Statuszeile - der kuerzeste Weg zu erscheinendem Text.
    await page.locator('#play-check').click();
    await expect(page.locator('#play-status')).not.toBeEmpty();
  });
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);
});

/*
 * Ein Waechter, dessen Versagen nie beobachtet wurde, ist kein Waechter.
 *
 * Hier wird absichtlich das gepflanzt, wovor der Auftraggeber gewarnt hat -
 * Text ueber dem Gitter - und belegt, dass es auffaellt. Zusaetzlich wird die
 * harmlose Variante gepflanzt, damit der Waechter nicht einfach alles meldet.
 */
test('der Waechter schlaegt bei einem gepflanzten Verstoss aus', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(PHONES[1].viewport);
  await openSoloPuzzle(page);
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);

  const plant = (pointerEvents: string) => page.evaluate((mode) => {
    document.getElementById('planted')?.remove();
    const cell = document.querySelector('.overview-mirror__cell')!;
    const rect = cell.getBoundingClientRect();
    const node = document.createElement('p');
    node.id = 'planted';
    node.textContent = 'Eine Meldung mitten im Gitter';
    node.style.cssText = `position:fixed;z-index:99;background:#fff;margin:0;`
      + `left:${rect.left - 10}px;top:${rect.top - 10}px;width:120px;height:60px;`
      + `pointer-events:${mode};`;
    document.body.append(node);
  }, pointerEvents);

  await plant('auto');
  const caught = await findOccludedCells(page, CELL_SELECTORS.overview);
  expect(caught.length, 'ein tippfangendes Overlay muss auffallen').toBeGreaterThan(0);
  expect(caught[0].covering).toContain('#planted');

  // Dasselbe Element ohne Tippfang ist ein erlaubtes Overlay.
  await plant('none');
  expect(await findOccludedCells(page, CELL_SELECTORS.overview),
    'ein Overlay mit pointer-events:none darf nicht gemeldet werden').toEqual([]);
});
```

- [ ] **Step 3: Lass den Selbsttest laufen und belege beide Richtungen**

```bash
rtk npx playwright test e2e/layout-guard.spec.ts --reporter=line
```

Erwartet: alle grün. Der Test `der Waechter schlaegt bei einem gepflanzten Verstoss aus` ist der Beleg — er ist nur grün, wenn der Wächter den echten Verstoß meldet **und** das harmlose Overlay durchlässt.

Falls ein `nichts verdeckt das Gitter` fehlschlägt: Du hast einen echten, bestehenden Layout-Fehler gefunden. Melde ihn, bevor du weitermachst; repariere ihn nicht nebenbei in dieser Aufgabe.

- [ ] **Step 4: Commit**

```bash
rtk git add e2e/support/layoutGuard.ts e2e/layout-guard.spec.ts && \
rtk git commit -m "test(layout): guard the grid against overlays and reflow

elementFromPoint skips pointer-events:none, so a deliberate overlay passes
and anything that would swallow a tap does not. Proven in both directions
by planting each kind."
```

---

### Task 2: Das Heft entfällt

**Belegt:** `collectOptions()` setzt `puzzleCount: 1` hart; `renderBooklet` hat genau **einen** Aufrufer (`main.js generate()`, via Serena bestätigt). Sechs e2e-Spezifikationen laufen heute durch den Heft-Bildschirm und müssen mitgezogen werden — das ist kein Kollateralschaden, sondern der Beleg, dass der neue Weg trägt.

**Files:**
- Delete: `client/js/screens/resultScreen.js`
- Modify: `client/index.html` (Abschnitt `screen-result` entfernen, Aktionsleiste der Einstellungen)
- Modify: `client/js/main.js` (`generate`, `wire`)
- Modify: `e2e/support/layoutGuard.ts` (Überbrückung entfernen)
- Modify: `e2e/daily-and-stats.spec.ts`, `e2e/duel.spec.ts`, `e2e/duel-stability.spec.ts`, `e2e/overview-canvas.spec.ts`, `e2e/play-sprint.spec.ts`, `e2e/solo.spec.ts`
- Test: `e2e/solo.spec.ts`

**Interfaces:**
- Consumes: `openSoloPuzzle` aus Aufgabe 1
- Produces: `generate(intent: 'play' | 'duel'): Promise<void>` in `main.js`; die Knöpfe `#generate-button` („Spielen") und `#duel-start-button` („Duell starten")

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

Ergänze in `e2e/solo.spec.ts`:

```ts
test('Erzeugen fuehrt unmittelbar ins Spiel, ohne Heft', async ({ page }) => {
  test.setTimeout(180_000);
  await openSoloPuzzle(page);            // enthaelt keinen Heft-Schritt mehr
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/);
  // Der Bildschirm existiert nicht mehr, also auch kein Weg zurueck auf ihn.
  await expect(page.locator('#screen-result')).toHaveCount(0);
  await expect(page.locator('[data-goto="screen-result"]')).toHaveCount(0);
});
```

- [ ] **Step 2: Lass ihn fehlschlagen**

```bash
rtk npx playwright test e2e/solo.spec.ts -g "ohne Heft" --reporter=line
```

Erwartet: FAIL mit `Expected: 0, Received: 1` für `#screen-result`.

- [ ] **Step 3: Entferne die Überbrückung aus dem Wächter**

Lösche in `e2e/support/layoutGuard.ts` die drei mit `ENTFAELLT MIT AUFGABE 2` markierten Zeilen.

- [ ] **Step 4: Entferne den Bildschirm aus dem HTML**

Lösche in `client/index.html` den gesamten Abschnitt `<!-- 3. Ergebnis -->` bis zum schließenden `</section>` (heute Zeilen 152–172).

Ersetze die Aktionsleiste der Einstellungen (heute Zeilen 146–148) durch:

```html
            <div class="action-bar action-bar--split">
                <button class="btn btn--primary btn--block" type="submit" id="generate-button">Spielen</button>
                <button class="btn btn--ghost btn--block" type="button" id="duel-start-button">Duell starten</button>
            </div>
```

- [ ] **Step 5: Verdrahte beide Wege**

Ersetze in `client/js/main.js` die Funktion `generate` (heute Zeilen 41–68) durch:

```js
/**
 * Erzeugt das eingestellte Raetsel und oeffnet es unmittelbar.
 *
 * Es gab einmal einen Heft-Bildschirm dazwischen, aus der Zeit, als ein Heft bis
 * zu zehn Raetsel hatte. `puzzleCount` steht seit langem fest auf 1, also zeigte
 * er genau eine Karte und kostete zwei Tippser - und war zugleich das Ziel, auf
 * das die Zurueck-Taste des Spiels zeigte, auch wenn er leer war.
 */
async function generate(intent) {
    const options = collectOptions();
    setBusy('Rätsel wird erzeugt und geprüft …');
    try {
        const data = await fetchBooklet(options);
        const puzzle = data.booklet.puzzles[0];
        if (!puzzle) throw new Error('Das Rätsel konnte nicht erzeugt werden.');
        state.options = options;
        setHint('config-hint', '');

        if (intent === 'duel') {
            await createDuelForPuzzle({
                player: getSelectedPlayer(),
                options: data.booklet.config,
                puzzle,
                puzzleIndex: 0,
            });
            return;
        }
        openPlay(puzzle, {
            mode: 'solo',
            player: getSelectedPlayer(),
            options,
            puzzleIndex: 0,
        });
    } catch (error) {
        setHint('config-hint', error.message, true);
    } finally {
        clearBusy();
    }
}
```

Entferne den Import von `renderBooklet` (Zeile 12). Ersetze in `wire()` die Formular- und Reroll-Verdrahtung (heute Zeilen 246–254) durch:

```js
    el('config-form').addEventListener('submit', event => {
        event.preventDefault();
        generate('play');
    });
    // Das Duell verschwindet vollstaendig, wenn der Spieler es ausgeblendet hat -
    // vorher hing dieselbe Regel am Heft, das es nicht mehr gibt.
    const duelStart = el('duel-start-button');
    duelStart.hidden = loadPrefs().hideDuel;
    duelStart.addEventListener('click', () => generate('duel'));
```

- [ ] **Step 6: Lösche die Datei**

```bash
rtk git rm client/js/screens/resultScreen.js
```

- [ ] **Step 7: Ziehe die sechs e2e-Spezifikationen nach**

In jeder der Dateien `e2e/daily-and-stats.spec.ts`, `e2e/duel.spec.ts`, `e2e/duel-stability.spec.ts`, `e2e/overview-canvas.spec.ts`, `e2e/play-sprint.spec.ts`, `e2e/solo.spec.ts`:

Ersetze das Warten auf das Heft und den Spielen-Tipp

```ts
await expect(page.locator('.puzzle')).toHaveCount(1, { timeout: 60_000 });
await page.getByRole('button', { name: 'Spielen', exact: true }).click();
```

durch das unmittelbare Warten auf das Spiel:

```ts
await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
```

In `e2e/duel.spec.ts` und `e2e/duel-stability.spec.ts` ersetze den Weg ins Duell

```ts
await host.getByRole('button', { name: 'Duell', exact: true }).click();
```

durch

```ts
await host.locator('#duel-start-button').click();
```

und entferne dort das vorausgehende Warten auf `.puzzle`, weil es kein Heft mehr gibt, auf dem das Duell angeboten würde — der Knopf steht jetzt auf den Einstellungen und wird statt `#generate-button` gedrückt.

- [ ] **Step 8: Lass alles laufen**

```bash
rtk npm test && rtk npx playwright test --reporter=line
```

Erwartet: alle grün, einschließlich `e2e/layout-guard.spec.ts` ohne die Überbrückung.

- [ ] **Step 9: Commit**

```bash
rtk git add -A && rtk git commit -m "refactor(flow): drop the booklet screen and play straight away

puzzleCount has been pinned to 1 for a long time, so the screen showed a
single card, cost two taps, and was the target the play screen's back button
pointed at even when it was empty. Generating now opens the puzzle, and the
duel starts from the same action bar."
```

---

### Task 3: Kontextabhängiges Zurück

**Belegt im Browser:** `DAILY BACK: label=← Übersicht -> screen=screen-result title="Heft" puzzles=0`. Nach Aufgabe 2 gibt es kein `screen-result` mehr, also braucht der Knopf ein echtes Ziel. Zusätzlich verlässt er heute ein laufendes Duell ohne Rückfrage, während „Prüfen" und „Löschen" je einen Dialog haben.

**Files:**
- Modify: `client/index.html` (Zurück-Knopf des Spiels)
- Modify: `client/js/play/playController.js`
- Test: `e2e/solo.spec.ts`, `e2e/duel.spec.ts`

**Interfaces:**
- Consumes: `askConfirm` aus `client/js/ui/confirmDialog.js`; `showScreen` aus `router.js`
- Produces: `leavePlay(): void` in `playController.js`

- [ ] **Step 1: Schreibe die fehlschlagenden Tests**

In `e2e/solo.spec.ts`:

```ts
test('Zurueck aus dem Tagesraetsel fuehrt auf den Start', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
  await page.route('**/api/players/*/results**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));
  await page.goto('/');
  await page.locator('#daily-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });

  await page.locator('#play-back').click();
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
});
```

In `e2e/duel.spec.ts` (am Ende, mit den dort bereits aufgebauten Seiten `host`):

```ts
test('ein laufendes Duell wird nicht ohne Rueckfrage verlassen', async ({ page }) => {
  // Aufbau wie im Duell-Test darueber: Host bis ins Spiel bringen.
  // ... (bestehenden Aufbau bis `#screen-play` wiederverwenden)
  await page.locator('#play-back').click();
  await expect(page.locator('#confirm-dialog')).toBeVisible();
  await expect(page.locator('#confirm-title')).toHaveText('Duell verlassen?');
  await page.locator('#confirm-cancel').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/);
});
```

- [ ] **Step 2: Lass sie fehlschlagen**

```bash
rtk npx playwright test e2e/solo.spec.ts -g "Zurueck aus dem Tagesraetsel" --reporter=line
```

Erwartet: FAIL, weil `#play-back` nicht existiert.

- [ ] **Step 3: Gib dem Knopf die Chrome aller anderen und eine Kennung**

Ersetze in `client/index.html` (heute Zeile 266):

```html
            <button class="btn btn--ghost btn--small" type="button" data-goto="screen-result" aria-label="Zurück zur Übersicht">← Übersicht</button>
```

durch:

```html
            <button class="btn btn--ghost btn--back" type="button" id="play-back" aria-label="Spiel verlassen">
                <span class="chevron" aria-hidden="true">‹</span><span class="btn__label">Zurück</span>
            </button>
```

Kein `data-goto` mehr: Das Ziel hängt vom Kontext ab, also entscheidet es der Spielbildschirm.

- [ ] **Step 4: Implementiere den Rückweg**

Ergänze in `client/js/play/playController.js` vor `initPlay`:

```js
/**
 * Verlaesst das Spiel auf dem Weg, auf dem man hereingekommen ist.
 *
 * Der Knopf zeigte fest auf den Heft-Bildschirm. Nach dem Tagesraetsel, nach
 * "Weiterspielen" und im Duell war dort nie ein Heft, sondern eine leere Seite,
 * deren eigene Zurueck-Taste in die Einstellungen fuehrte.
 *
 * Das Duell fragt vorher nach. Es ist der einzige Zustand, den das Verlassen
 * unwiederbringlich kostet - waehrend "Pruefen" und "Loeschen" laengst je einen
 * Dialog hatten. Die Absicherung war invers zum Risiko.
 */
export function leavePlay() {
    if (state.context?.mode === 'duel' && !state.solved) {
        askConfirm({
            title: 'Duell verlassen?',
            text: 'Das Duell läuft weiter und die Zeit ebenfalls. Dein Gegner spielt zu Ende.',
            confirmLabel: 'Verlassen',
            destructive: true,
            onConfirm: () => showScreen('screen-start'),
        });
        return;
    }
    showScreen('screen-start');
}
```

Ergänze in `initPlay` bei den übrigen Knöpfen:

```js
    el('play-back').addEventListener('click', leavePlay);
```

- [ ] **Step 5: Lass die Tests laufen**

```bash
rtk npx playwright test e2e/solo.spec.ts e2e/duel.spec.ts e2e/layout-guard.spec.ts --reporter=line
```

Erwartet: grün. Der Layout-Wächter läuft mit, weil sich die Kopfzeile des Spiels geändert hat.

- [ ] **Step 6: Commit**

```bash
rtk git add -A && rtk git commit -m "fix(play): leave the game the way you came in

The back button pointed at the booklet screen unconditionally, so the daily
puzzle, a resumed game and a duel all landed on an empty page whose own back
button led into the settings. Leaving a running duel now asks first, which
check and clear have done all along."
```

---

### Task 4: System-Zurück und Fokus

**Belegt:** kein `pushState`, kein `popstate` im gesamten Client. `showScreen` hat acht Aufrufer (via Serena: `wireBackButtons`, `playerController` ×1, `duelResultController`, `playController` ×2, `duelEntryScreen`, `lobbyController`, `main.js` ×2). Alle laufen durch dieselbe Funktion, also genügt ein Eingriff an einer Stelle.

**Files:**
- Modify: `client/js/router.js`
- Modify: `client/js/play/playController.js` (`leavePlay` muss die Geste beantworten)
- Test: `e2e/navigation.spec.ts` (neu)

**Interfaces:**
- Consumes: `leavePlay` aus Aufgabe 3
- Produces: `onBackRequest(handler: (from: string) => boolean): void` in `router.js` — der Handler gibt `false` zurück, um den Austritt abzulehnen

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

`e2e/navigation.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { openSoloPuzzle } from './support/layoutGuard';

test('die System-Zurueck-Geste geht einen Bildschirm zurueck', async ({ page }) => {
  test.setTimeout(180_000);
  await openSoloPuzzle(page);
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/);

  await page.goBack();
  await expect(page.locator('#screen-config')).toHaveClass(/is-active/);
  await page.goBack();
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
});

test('der Fokus wandert auf die Ueberschrift des neuen Bildschirms', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#start-button').click();
  // Ohne das bleibt der Fokus auf dem Knopf, den es auf diesem Bildschirm
  // nicht mehr gibt, und Tastatur wie Screenreader verlieren ihre Stelle.
  const focused = await page.evaluate(() => document.activeElement?.closest('.screen')?.id);
  expect(focused).toBe('screen-config');
});
```

- [ ] **Step 2: Lass ihn fehlschlagen**

```bash
rtk npx playwright test e2e/navigation.spec.ts --reporter=line
```

Erwartet: FAIL — `page.goBack()` verlässt die App, weil es keinen History-Eintrag gibt.

- [ ] **Step 3: Erweitere den Router**

Ersetze `client/js/router.js` vollständig durch:

```js
/**
 * Bildschirmwechsel mit Scroll-Wiederherstellung, System-Zurueck und Fokus.
 *
 * Die alte Fassung scrollte immer nach oben, was auf iOS bedeutete, dass ein
 * "Zurueck" auf eine lange Ergebnisliste wieder ganz am Anfang landete.
 *
 * Jeder Bildschirm ist jetzt zusaetzlich ein History-Eintrag. Ohne das beendet
 * die Zurueck-Taste auf Android die App und die Randwisch-Geste auf iOS tut
 * nichts - in einer Home-Screen-App ist das das auffaelligste unnative
 * Verhalten ueberhaupt.
 */

const listeners = { enter: [], leave: [], back: [] };
const scrollPositions = new Map();
let current = 'screen-start';
/** Unterdrueckt das Schieben, waehrend wir selbst auf popstate reagieren. */
let replaying = false;

export function onEnter(handler) { listeners.enter.push(handler); }
export function onLeave(handler) { listeners.leave.push(handler); }

/**
 * Darf der Spieler diesen Bildschirm gerade verlassen?
 *
 * Ein Handler, der `false` zurueckgibt, lehnt ab - er hat dann in aller Regel
 * einen Dialog geoeffnet. Der History-Eintrag wird wieder vorgeschoben, damit
 * Modell und Adressleiste nicht auseinanderlaufen.
 */
export function onBackRequest(handler) { listeners.back.push(handler); }

export function currentScreen() { return current; }

function applyScreen(id) {
    scrollPositions.set(current, window.scrollY);
    for (const handler of listeners.leave) handler(current, id);

    for (const screen of document.querySelectorAll('.screen')) {
        screen.classList.toggle('is-active', screen.id === id);
    }
    current = id;

    // Sofort wiederherstellen statt weich zu scrollen: ein animierter Sprung
    // auf einem eben getauschten Bildschirm liest sich als Fehler.
    window.scrollTo({ top: scrollPositions.get(id) ?? 0, behavior: 'auto' });
    moveFocus(id);

    for (const handler of listeners.enter) handler(id);
}

/**
 * Setzt den Fokus auf die Ueberschrift des neuen Bildschirms.
 *
 * Vorher blieb er auf dem Knopf, den der Wechsel gerade entfernt hat; der
 * Browser faellt dann auf <body> zurueck und Tastatur wie Screenreader fangen
 * bei jedem Wechsel von vorne an. `tabindex="-1"` macht die Ueberschrift
 * fokussierbar, ohne sie in die Tab-Reihenfolge zu haengen.
 */
function moveFocus(id) {
    const heading = document.querySelector(`#${id} h1, #${id} h2`);
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.focus({ preventScroll: true });
}

export function showScreen(id) {
    if (id === current) return;
    applyScreen(id);
    if (!replaying) history.pushState({ screen: id }, '');
}

/** Der Weg zurueck, den sowohl die Geste als auch ein Zurueck-Knopf nimmt. */
function goBack(toScreen) {
    for (const handler of listeners.back) {
        if (handler(current) === false) {
            // Abgelehnt: den Eintrag wieder vorschieben, sonst zeigt die
            // History einen Bildschirm an, auf dem wir nicht sind.
            history.pushState({ screen: current }, '');
            return;
        }
    }
    replaying = true;
    applyScreen(toScreen);
    replaying = false;
}

export function wireBackButtons() {
    for (const button of document.querySelectorAll('[data-goto]')) {
        button.addEventListener('click', () => showScreen(button.dataset.goto));
    }

    history.replaceState({ screen: 'screen-start' }, '');
    window.addEventListener('popstate', event => {
        goBack(event.state?.screen ?? 'screen-start');
    });
}
```

- [ ] **Step 4: Lass den Duell-Dialog die Geste beantworten**

Ersetze in `client/js/play/playController.js` die Funktion `leavePlay` aus Aufgabe 3 durch die Fassung, die beide Wege bedient:

```js
/**
 * Darf das Spiel gerade verlassen werden?
 *
 * Gibt `false` zurueck und oeffnet die Rueckfrage, wenn ein Duell laeuft. Der
 * Router schiebt den History-Eintrag dann wieder vor, damit die System-Geste
 * und der Zurueck-Knopf dieselbe Antwort bekommen.
 */
function mayLeavePlay() {
    if (state.context?.mode !== 'duel' || state.solved) return true;
    askConfirm({
        title: 'Duell verlassen?',
        text: 'Das Duell läuft weiter und die Zeit ebenfalls. Dein Gegner spielt zu Ende.',
        confirmLabel: 'Verlassen',
        destructive: true,
        onConfirm: () => showScreen('screen-start'),
    });
    return false;
}

export function leavePlay() {
    if (mayLeavePlay()) showScreen('screen-start');
}
```

Ergänze in `initPlay` neben der `play-back`-Verdrahtung:

```js
    onBackRequest(from => (from === 'screen-play' ? mayLeavePlay() : true));
```

und erweitere den Router-Import oben in der Datei:

```js
import { onBackRequest, onLeave, showScreen } from '../router.js';
```

> **Achtung:** `onConfirm` ruft `showScreen('screen-start')`, was einen History-Eintrag schiebt. Das ist beabsichtigt: Der Spieler hat den Austritt aktiv bestätigt, also ist der Start der neue vorderste Eintrag.

- [ ] **Step 5: Lass alles laufen**

```bash
rtk npm test && rtk npx playwright test --reporter=line
```

Erwartet: grün. Achte besonders auf `e2e/duel.spec.ts` und `e2e/duel-stability.spec.ts` — der Router ist jetzt an jedem Bildschirmwechsel beteiligt.

- [ ] **Step 6: Commit**

```bash
rtk git add -A && rtk git commit -m "feat(router): answer the system back gesture, and move focus

Every screen is a history entry now, so Android's back button and iOS's edge
swipe go back a screen instead of leaving the app. A refused duel exit pushes
the entry forward again so the model and the address bar agree. Focus lands on
the new screen's heading rather than being dropped on a removed button."
```

---

### Task 5: Einstellungen als eigener Bildschirm

**Belegt:** Die Spiel-Vorlieben werden in `configScreen.loadOptions` verdrahtet (Serena: beide `loadPrefs`-Fundstellen dort), also nur erreichbar über den Erzeugen-Ablauf. Sie gelten aber auch fürs Tagesrätsel, dessen Weg den Bildschirm nie passiert. `derivesCrosses()` liest bei jeder Aktion neu, das Umschalten im Spiel trägt also bereits.

**Files:**
- Create: `client/js/screens/settingsScreen.js`
- Modify: `client/index.html` (neuer Abschnitt, Gruppe „Beim Spielen" aus den Einstellungen entfernen, Knöpfe)
- Modify: `client/js/screens/configScreen.js` (Vorlieben-Verdrahtung entfernen)
- Modify: `client/js/main.js`
- Test: `e2e/settings.spec.ts` (neu)

**Interfaces:**
- Produces: `initSettingsScreen(): void` in `settingsScreen.js`; Bildschirm `#screen-settings`; Knöpfe `#settings-button` (Start) und `#play-settings` (Spiel)

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

`e2e/settings.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { CELL_SELECTORS, findOccludedCells, openSoloPuzzle } from './support/layoutGuard';

test('Vorlieben sind vom Start aus erreichbar, ohne den Erzeugen-Ablauf', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
  await page.goto('/');
  await page.locator('#settings-button').click();
  await expect(page.locator('#screen-settings')).toHaveClass(/is-active/);
  await page.locator('#field-hideClock').check();
  await expect(page.locator('#screen-config')).not.toHaveClass(/is-active/);
});

test('die Vorliebe wirkt im laufenden Spiel und verschiebt das Gitter nicht', async ({ page }) => {
  test.setTimeout(180_000);
  await openSoloPuzzle(page);
  await expect(page.locator('#play-timer')).toBeVisible();

  await page.locator('#play-settings').click();
  await expect(page.locator('#screen-settings')).toHaveClass(/is-active/);
  await page.locator('#field-hideClock').check();
  await page.goBack();

  await expect(page.locator('#screen-play')).toHaveClass(/is-active/);
  await expect(page.locator('#play-timer')).toBeHidden();
  // Eine verschwindende Uhr darf das Gitter nicht verdecken oder verdraengen.
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);
});
```

- [ ] **Step 2: Lass ihn fehlschlagen**

```bash
rtk npx playwright test e2e/settings.spec.ts --reporter=line
```

Erwartet: FAIL — `#settings-button` existiert nicht.

- [ ] **Step 3: Baue den Bildschirm**

Verschiebe in `client/index.html` die gesamte Gruppe `<section class="group">` mit `id="caption-assist"` (heute Zeilen 116–142) aus `#screen-config` heraus in einen neuen Abschnitt hinter `#screen-stats`:

```html
    <section class="screen screen--settings" id="screen-settings">
        <header class="bar">
            <button class="btn btn--ghost btn--back" type="button" data-goto="screen-start" aria-label="Zurück">
                <span class="chevron" aria-hidden="true">‹</span><span class="btn__label">Zurück</span>
            </button>
            <h2>Beim Spielen</h2>
        </header>
        <!-- hierher die verschobene Gruppe, unveraendert -->
    </section>
```

Ergänze auf dem Startbildschirm hinter `#stats-button`:

```html
                <button class="btn btn--on-dark btn--block" id="settings-button" type="button">Einstellungen</button>
```

Ergänze in der Werkzeugleiste des Spiels hinter `#play-view`:

```html
            <button class="btn btn--ghost btn--small btn--icon" type="button" id="play-settings" aria-label="Einstellungen" title="Einstellungen">
                <svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <circle cx="12" cy="12" r="3" />
                    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
                </svg>
            </button>
```

> **Achtung Layout:** Die Werkzeugleiste ist auf Telefonen ein Raster mit **fünf** festen Spalten (`client/styles/play.css:96-108`, `grid-template-columns: repeat(5, minmax(0, 1fr))`). Ein sechster Knopf ohne Anpassung bricht in eine zweite Zeile um und schiebt das Gitter nach unten. Ändere denselben Block auf `repeat(6, minmax(0, 1fr))` und setze dort `font-size: 12px`. Der Wächter aus Aufgabe 1 prüft danach die 44-pt-Grenze mit; wenn sie fällt, gehört das Zahnrad nicht in die Leiste, sondern neben die Uhr in `.play-bar` — melde das dann, statt die Grenze zu senken.

- [ ] **Step 4: Schreibe das Modul**

`client/js/screens/settingsScreen.js`:

```js
/**
 * Spiel-Vorlieben, an einem Ort, der kein Raetsel erzeugt.
 *
 * Sie lagen im Erzeugen-Ablauf: um die Uhr auszublenden, musste man "Raetsel
 * erstellen" druecken. Sie gelten aber auch fuers Tagesraetsel, dessen Weg
 * diesen Bildschirm nie passiert hat.
 */

import { el } from '../dom.js';
import { loadPrefs, savePrefs } from '../play/playPrefs.js';

const KEYS = ['autoCross', 'hideClock', 'hideDuel'];

export function initSettingsScreen() {
    const prefs = loadPrefs();
    for (const key of KEYS) {
        const field = el(`field-${key}`);
        field.checked = prefs[key];
        // Bei jeder Aenderung neu lesen: ein anderer Schalter kann seither
        // umgelegt worden sein, auch in einem zweiten Tab.
        field.addEventListener('change', () => savePrefs({ ...loadPrefs(), [key]: field.checked }));
    }
}
```

- [ ] **Step 5: Entferne die Verdrahtung aus den Einstellungen**

Lösche in `client/js/screens/configScreen.js` die Zeilen 55–63 (den Block ab dem Kommentar `Play-time preferences are not booklet options`) und den Import `loadPrefs, savePrefs` in Zeile 5.

- [ ] **Step 6: Verdrahte die beiden Wege**

Ergänze in `client/js/main.js` den Import und in `wire()`:

```js
import { initSettingsScreen } from './screens/settingsScreen.js';
```

```js
    initSettingsScreen();
    el('settings-button').addEventListener('click', () => showScreen('screen-settings'));
    el('play-settings').addEventListener('click', () => showScreen('screen-settings'));
```

> **Achtung:** Das Verlassen des Spiels über das Zahnrad läuft **nicht** durch `mayLeavePlay` — man verlässt das Duell dabei nicht wirklich, man schaut nur kurz weg, und `onLeave` hält Uhr und Fortschritt ohnehin an. Die Rückfrage hier auszulösen wäre falsch.

- [ ] **Step 7: Lass alles laufen**

```bash
rtk npm test && rtk npx playwright test --reporter=line
```

- [ ] **Step 8: Commit**

```bash
rtk git add -A && rtk git commit -m "feat(settings): give play preferences a screen of their own

Hiding the clock meant pressing 'create a puzzle' first, and the daily puzzle
never passes that screen although the preferences apply to it. They are now
reachable from the start and from inside a game; autoCross was already read per
action, so changing it mid-puzzle takes effect immediately."
```

---

### Task 6: Ergebnisse und Statistik zusammenlegen

**Belegt:** Beide lesen `listPlayerResults` und widersprechen sich im Umfang — History 50 (`historyScreen.js:61`), Statistik 100 (`statsScreen.js:113`).

**Files:**
- Modify: `client/index.html` (Reiter in `#screen-history`, `#screen-stats` entfernen, Startknopf entfernen)
- Modify: `client/js/screens/historyScreen.js`
- Modify: `client/js/screens/statsScreen.js`
- Modify: `client/js/main.js`, `client/js/players/playerController.js`
- Test: `e2e/daily-and-stats.spec.ts`

**Interfaces:**
- Consumes: `personalStats`, `headToHead` aus `client/js/stats/statistics.js`
- Produces: `loadHistoryScreen(player): Promise<void>` lädt **einmal** mit Limit 100 und füllt beide Reiter; `renderStatsInto(node, results, today): void` in `statsScreen.js` ersetzt `loadStatsScreen`

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

In `e2e/daily-and-stats.spec.ts`:

```ts
test('Ergebnisse und Statistik teilen einen Bildschirm und eine Abfrage', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/players/*/results**', route => {
    calls += 1;
    const url = new URL(route.request().url());
    expect(url.searchParams.get('limit'), 'beide Reiter lesen denselben Umfang').toBe('100');
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
    });
  });
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
  await page.goto('/');
  await expect(page.locator('#stats-button')).toHaveCount(0);   // nur noch ein Knopf

  await page.locator('#history-button').click();
  await expect(page.locator('#screen-history')).toHaveClass(/is-active/);
  const before = calls;
  await page.locator('#history-tab-stats').click();
  await expect(page.locator('#history-panel-stats')).toBeVisible();
  expect(calls, 'der Reiterwechsel darf nicht neu laden').toBe(before);
});
```

- [ ] **Step 2: Lass ihn fehlschlagen**

```bash
rtk npx playwright test e2e/daily-and-stats.spec.ts -g "teilen einen Bildschirm" --reporter=line
```

Erwartet: FAIL — `#stats-button` ist noch da.

- [ ] **Step 3: Baue die Reiter**

Ersetze in `client/index.html` den Rumpf von `#screen-history` (heute Zeilen 245–247) durch:

```html
        <p class="result-sub" id="history-player"></p>
        <div class="segmented" role="tablist" aria-label="Ansicht">
            <button class="segment is-active" type="button" id="history-tab-list"
                    role="tab" aria-selected="true" aria-controls="history-panel-list">Rätsel</button>
            <button class="segment" type="button" id="history-tab-stats"
                    role="tab" aria-selected="false" aria-controls="history-panel-stats">Statistik</button>
        </div>
        <div id="history-panel-list" role="tabpanel">
            <div class="history-list" id="history-list"></div>
        </div>
        <div id="history-panel-stats" role="tabpanel" hidden>
            <div id="stats-body"></div>
            <p class="stats-scope">Über die letzten 100 Rätsel.</p>
        </div>
        <p class="hint" id="history-hint" role="status"></p>
```

Lösche den gesamten Abschnitt `#screen-stats` (heute Zeilen 250–261) und den Knopf `#stats-button` vom Startbildschirm. Benenne `#history-button` in der Beschriftung zu `Ergebnisse & Statistik`.

- [ ] **Step 4: Lass die Statistik in einen Knoten rendern**

Ersetze in `client/js/screens/statsScreen.js` die Funktion `loadStatsScreen` (Zeilen 105–124) durch:

```js
/**
 * Rendert die Statistik in einen bereitgestellten Knoten.
 *
 * Laedt nicht selbst: der Bildschirm traegt jetzt beide Ansichten und liest
 * einmal. Vorher las er 100 und die Raetselliste daneben 50, also gaben zwei
 * benachbarte Knoepfe verschiedene Antworten auf "meine Ergebnisse".
 */
export function renderStatsInto(node, results, today) {
    const body = clear(node);
    if (!results.length) return;
    body.append(personalSection(personalStats(results, today)));
    for (const entry of headToHead(results)) body.append(duelSection(entry));
}
```

Entferne die nun ungenutzten Importe `el`, `setHint` und `listPlayerResults`; behalte `clear`, `make` und `berlinDate` nur, soweit sie noch gebraucht werden (`berlinDate` wandert zum Aufrufer).

- [ ] **Step 5: Lass den Verlauf beide Reiter füllen**

Ersetze in `client/js/screens/historyScreen.js` `loadHistoryScreen` (Zeilen 56–65) durch:

```js
export async function loadHistoryScreen(player) {
    el('history-player').textContent = `Ergebnisse von ${player.displayName}`;
    const list = clear(el('history-list'));
    setHint('history-hint', 'Ergebnisse werden geladen …');
    try {
        // 100 ist die Obergrenze des Workers - darueber antwortet er mit 400
        // statt zu kappen - und beide Reiter teilen sich diese eine Abfrage.
        const results = await listPlayerResults(player.id, 100);
        setHint('history-hint', results.length ? '' : 'Noch keine abgeschlossenen Rätsel.');
        for (const result of results) list.append(resultCard(result));
        renderStatsInto(el('stats-body'), results, berlinDate());
    } catch (error) { setHint('history-hint', error.message, true); }
}
```

Ergänze oben die Importe:

```js
import { renderStatsInto } from './statsScreen.js';
import { berlinDate } from '../play/dailyPuzzle.js';
```

Ergänze am Ende derselben Datei die Reiter-Verdrahtung:

```js
/** Die Reiter tauschen nur Sichtbarkeit; geladen wurde schon einmal. */
export function initHistoryTabs() {
    const tabs = [
        { tab: el('history-tab-list'), panel: el('history-panel-list') },
        { tab: el('history-tab-stats'), panel: el('history-panel-stats') },
    ];
    for (const { tab } of tabs) {
        tab.addEventListener('click', () => {
            for (const entry of tabs) {
                const active = entry.tab === tab;
                entry.tab.classList.toggle('is-active', active);
                entry.tab.setAttribute('aria-selected', String(active));
                entry.panel.hidden = !active;
            }
        });
    }
}
```

- [ ] **Step 6: Räume die Aufrufer auf**

Entferne in `client/js/main.js` den Import `loadStatsScreen`, den `#stats-button`-Block in `wire()` und die Zeile `el('stats-button').disabled = !player;` in `refreshStartScreen`. Rufe `initHistoryTabs()` in `wire()` auf.

- [ ] **Step 7: Lass alles laufen**

```bash
rtk npm test && rtk npx playwright test --reporter=line
```

- [ ] **Step 8: Commit**

```bash
rtk git add -A && rtk git commit -m "refactor(history): one screen for results and statistics

Two adjacent buttons read the same endpoint and disagreed about it: the list
asked for 50 entries, the statistics for 100. They are tabs over a single
request now."
```

---

### Task 7: Legende, Ersteinführung und der entwaffnete Zustand

**Belegt:** Keine Treffer für Anleitung/Tutorial/Hilfe/Legende im Client. Die Bedeutung der Werkzeuge steht nur im `aria-label` (`index.html:309-312`). Das aktive Werkzeug erneut zu drücken entwaffnet es (`markTool.js:45`), wonach jeder Tipp wirkungslos bleibt, ohne dass das irgendwo steht.

**Files:**
- Create: `client/js/ui/firstRun.js`
- Modify: `client/index.html` (Legende unter der Werkzeugleiste, Dialog)
- Modify: `client/styles/play.css`
- Modify: `client/js/play/playController.js`, `client/js/play/markTool.js`
- Test: `e2e/first-run.spec.ts` (neu)

**Interfaces:**
- Consumes: `createMarkTool({ buttons, onChange })` — `onChange` existiert bereits und wird jetzt erstmals genutzt
- Produces: `showFirstRunIfNeeded(): void` in `firstRun.js`; Speicherschlüssel `logicals.seenIntro.v1`

- [ ] **Step 1: Schreibe die fehlschlagenden Tests**

`e2e/first-run.spec.ts`:

```ts
import { expect, test } from '@playwright/test';
import { CELL_SELECTORS, findOccludedCells, expectStableGrid, openSoloPuzzle } from './support/layoutGuard';

test('die Einfuehrung erscheint einmal und dann nie wieder', async ({ page }) => {
  test.setTimeout(180_000);
  await openSoloPuzzle(page);
  await expect(page.locator('#intro-dialog')).toBeVisible();
  await page.locator('#intro-close').click();
  await expect(page.locator('#intro-dialog')).toBeHidden();

  await page.locator('#play-back').click();
  await page.locator('#daily-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#intro-dialog')).toBeHidden();
});

test('die Legende steht da und verdeckt nichts', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem('logicals.seenIntro.v1', '1'));
  await openSoloPuzzle(page);
  await expect(page.locator('#tool-legend')).toContainText('ausgeschlossen');
  await expect(page.locator('#tool-legend')).toContainText('vermutet');
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);
});

test('der entwaffnete Zustand wird benannt, ohne das Gitter zu verschieben', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => localStorage.setItem('logicals.seenIntro.v1', '1'));
  await openSoloPuzzle(page);

  await expectStableGrid(page, '#overview-viewport', async () => {
    // Das aktive Werkzeug erneut druecken entwaffnet es.
    await page.locator('#overview-mark-no').click();
    await expect(page.locator('#play-status')).toContainText('Kein Werkzeug gewählt');
  });
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);

  await page.locator('#overview-mark-no').click();
  await expect(page.locator('#play-status')).toBeEmpty();
});
```

- [ ] **Step 2: Lass sie fehlschlagen**

```bash
rtk npx playwright test e2e/first-run.spec.ts --reporter=line
```

Erwartet: FAIL — `#intro-dialog` existiert nicht.

- [ ] **Step 3: Baue Legende und Dialog**

Ergänze in `client/index.html` unmittelbar hinter `<div class="overview-marks" …>…</div>`:

```html
                    <p class="tool-legend" id="tool-legend">× ausgeschlossen · ○ sichere Zuordnung · · vermutet · ␣ löschen</p>
```

Ergänze neben den übrigen Dialogen:

```html
    <dialog class="confirm" id="intro-dialog" aria-labelledby="intro-title">
        <h3 class="confirm__title" id="intro-title">So wird markiert</h3>
        <p class="confirm__text">
            Wähle unten ein Werkzeug und tippe dann Zellen an. <b>×</b> schließt aus,
            <b>○</b> bestätigt eine sichere Zuordnung, <b>·</b> merkt eine Vermutung vor
            und <b>␣</b> löscht wieder.
        </p>
        <p class="confirm__text">
            Ein Tipp auf das bereits gewählte Werkzeug legt es weg – dann passiert beim
            Antippen nichts, und du kannst das Gitter in Ruhe ansehen.
        </p>
        <form method="dialog" class="confirm__actions">
            <button class="btn btn--primary" type="submit" id="intro-close" autofocus>Los geht’s</button>
        </form>
    </dialog>
```

Ergänze in `client/styles/play.css` bei den übrigen `.overview-*`-Regeln:

```css
/*
 * Die Bedeutung der vier Werkzeuge stand nur im aria-label: ein
 * Screenreader-Nutzer wurde informiert, ein sehender nicht. Die Zeile steht
 * dauerhaft in der Aktionsleiste - sie ist Teil des Flusses und kann darum
 * nichts verdecken und nichts verdraengen.
 */
.tool-legend {
    margin: var(--space-1) 0 0;
    font-size: 11px;
    line-height: 1.3;
    color: var(--muted);
    text-align: center;
}
```

> **Achtung Layout:** Die Aktionsleiste ist im Querformat eine 150 px breite Seitenspalte. Prüfe dort, dass die Legende umbricht statt zu überlaufen; notfalls im Querformat-Block `display: none` setzen — die Einführung hat den Inhalt dann bereits einmal erklärt. Der Wächter prüft `hasHorizontalScroll` mit.

- [ ] **Step 4: Schreibe das Modul**

`client/js/ui/firstRun.js`:

```js
/**
 * Die einmalige Erklaerung der Markierungen.
 *
 * Es gab keine. Die Bedeutung der vier Werkzeuge stand ausschliesslich im
 * aria-label, und "␣" fuer loeschen ist nicht erratbar.
 */

const STORAGE_KEY = 'logicals.seenIntro.v1';

export function showFirstRunIfNeeded() {
    let seen = false;
    // Im privaten Modus wirft der Zugriff; dann lieber einmal zu viel erklaeren
    // als den Spielbildschirm gar nicht zu oeffnen.
    try { seen = localStorage.getItem(STORAGE_KEY) === '1'; } catch { seen = false; }
    if (seen) return;
    try { localStorage.setItem(STORAGE_KEY, '1'); } catch { /* egal */ }
    document.getElementById('intro-dialog')?.showModal();
}
```

- [ ] **Step 5: Benenne den entwaffneten Zustand**

Ergänze in `client/js/play/playController.js` den Import und rufe die Einführung am Ende von `openPlay` auf, **nach** `showScreen('screen-play')`:

```js
import { showFirstRunIfNeeded } from '../ui/firstRun.js';
```

```js
    showFirstRunIfNeeded();
```

Erweitere in `initPlay` die Werkzeug-Erzeugung um den bereits vorgesehenen, bisher ungenutzten Rückruf:

```js
    tool = createMarkTool({
        buttons: [
            el('overview-mark-no'), el('overview-mark-yes'),
            el('overview-mark-maybe'), el('overview-mark-clear'),
        ],
        // Das Werkzeug wegzulegen ist ein stiller vierter Zustand: danach bleibt
        // jeder Tipp wirkungslos, und nichts sagte, warum. Die Statuszeile ist
        // ein Overlay, sie kann das Gitter darum nicht verdraengen.
        onChange: current => {
            if (!current) setStatus('Kein Werkzeug gewählt – tippe eines unten an.');
            else if (el('play-status').textContent.startsWith('Kein Werkzeug')) setStatus('');
        },
    });
```

> **Achtung:** `createMarkTool` ruft `render()` — und damit `onChange` — schon im Konstruktor auf, bevor `initPlay` fertig ist. Das ist unkritisch, weil das Startwerkzeug `'no'` ist und der Zweig damit nur `setStatus('')` auf einer ohnehin leeren Zeile aufruft. Ändere die Reihenfolge nicht ohne diesen Punkt zu prüfen.

- [ ] **Step 6: Lass alles laufen**

```bash
rtk npm test && rtk npx playwright test --reporter=line
```

- [ ] **Step 7: Commit**

```bash
rtk git add -A && rtk git commit -m "feat(play): explain the marking tools, once and then on the surface

Their meaning lived only in aria-label, so a screen reader user was told and a
sighted one was not. Disarming the tool - which makes every tap inert - now
says so in the status line, which is an overlay and cannot displace the grid."
```

---

### Task 8: Wortschatz und Chrome vereinheitlichen

**Belegt:** „Fehlversuche" in `historyScreen.js:35,46` gegen „Fehlprüfungen" in `index.html:379`, `playController.js:291`, `duelResultScreen.js:18`, `statsScreen.js:50`.

**Files:**
- Modify: `client/js/screens/historyScreen.js`
- Test: `test/wording.test.ts` (neu)

- [ ] **Step 1: Schreibe den fehlschlagenden Test**

`test/wording.test.ts` — nach dem Muster von `test/app-shell.test.ts`, weil die Unit-Umgebung kein DOM hat:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/** Jede .js unter client/js, rekursiv. */
function clientSources(directory = resolve('client/js')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return clientSources(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

describe('Wortschatz', () => {
  it('nennt eine fehlgeschlagene Pruefung ueberall gleich', () => {
    // Dieselbe Zahl hiess in der Raetselliste "Fehlversuche" und im Dialog,
    // in der Statistik und im Duell-Ergebnis "Fehlpruefungen".
    const offenders = [...clientSources(), resolve('client/index.html')]
      .filter(path => readFileSync(path, 'utf8').includes('Fehlversuch'))
      .map(path => path.split('/client/')[1]);
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 2: Lass ihn fehlschlagen**

```bash
rtk npm test -- wording
```

Erwartet: FAIL mit `[ "js/screens/historyScreen.js" ]`.

- [ ] **Step 3: Vereinheitliche**

Ersetze in `client/js/screens/historyScreen.js` beide Vorkommen, mit der Einzahl-Behandlung, die der Rest der App schon hat:

Zeile 35:
```js
                + ` · ${result.opponentFailedChecks} ${result.opponentFailedChecks === 1 ? 'Fehlprüfung' : 'Fehlprüfungen'}${margin}`,
```

Zeile 46:
```js
        text: `${formatDuration(result.elapsedMs)} · ${result.failedChecks} `
            + `${result.failedChecks === 1 ? 'Fehlprüfung' : 'Fehlprüfungen'}`,
```

- [ ] **Step 4: Lass alles laufen**

```bash
rtk npm test && rtk npx playwright test --reporter=line
```

- [ ] **Step 5: Commit**

```bash
rtk git add -A && rtk git commit -m "fix(copy): call a failed check the same thing everywhere

The puzzle list said 'Fehlversuche' while the dialog, the statistics and the
duel result said 'Fehlprüfungen' for the same number. A test now keeps them
from drifting apart again."
```

---

## Abschluss

Nach Aufgabe 8:

```bash
rtk npm test && rtk npx playwright test --reporter=line && rtk npx tsc --noEmit
```

Alles grün, dann `rtk git push`. Der Deploy ist ein eigener Schritt und braucht ausdrückliche Zustimmung.

## Selbstprüfung des Plans

**Abdeckung der Spec.** B1 → Aufgaben 2 + 3. B2 → Aufgabe 2. B3 → Aufgabe 5. B4 → Aufgabe 7. B5 → Aufgabe 6. B6 → Aufgabe 4. B7 → Aufgaben 3 (Chrome) + 8 (Wortschatz). Die Layout-Bedingung → Aufgabe 1, danach in jeder Aufgabe aufgerufen. Keine Lücke.

**Platzhalter.** Keine. Jeder Code-Schritt trägt den einzusetzenden Text.

**Namenskonsistenz.** `openSoloPuzzle`, `findOccludedCells`, `expectStableGrid`, `CELL_SELECTORS` werden in Aufgabe 1 definiert und in 2, 5 und 7 unter genau diesen Namen benutzt. `mayLeavePlay` ersetzt in Aufgabe 4 bewusst die in Aufgabe 3 eingeführte Fassung von `leavePlay`; das ist im Text ausgewiesen. `renderStatsInto` ersetzt `loadStatsScreen`, dessen letzter Aufrufer in derselben Aufgabe entfernt wird.

**Bekannte Stolperstellen, die im Plan benannt sind.** Das Fünf-Spalten-Raster der Werkzeugleiste (Aufgabe 5), die Seitenspalte im Querformat (Aufgabe 7), der `onChange`-Aufruf im Konstruktor von `createMarkTool` (Aufgabe 7), die sechs e2e-Spezifikationen am Heft (Aufgabe 2) und die vorläufige Überbrückung in `openSoloPuzzle` (Aufgaben 1 → 2).
