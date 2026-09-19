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

/*
 * Was fuer eine Zelle "der Tipp kommt an" heisst, haengt an der Ansicht.
 *
 * In der Gesamtansicht ist die Zelle selbst nur der Spiegel fuer VoiceOver und
 * die Tastatur; `client/styles/play.css` nimmt ihr `pointer-events` mit Absicht
 * ab, damit ein echter Finger immer auf dem Canvas landet, dem Auswahl und die
 * Pinch-Geste gehoeren. Ein Treffer auf diesem Canvas ist also ein Treffer auf
 * der Zelle - alles andere nicht.
 *
 * `root` begrenzt die Frage zusaetzlich auf den sichtbaren Ausschnitt: der
 * Spiegel ist `overflow: hidden`, eine weggeschobene Zelle liegt also hinter
 * dem Rand. Das ist Beschneidung durch Schwenken, nicht Verdeckung - dieselbe
 * Kategorie wie "ausserhalb des Fensters".
 */
const CELL_CONTEXT: Record<string, { root: string; surface?: string }> = {
  [CELL_SELECTORS.overview]: { root: '#overview-viewport', surface: '#overview-canvas' },
  /*
   * Die Seite des Pagers ist ihr eigener Scroll-Container, und im Querformat
   * nutzt sie das: gemessen 263px Inhalt in einem 135px hohen Fenster. Vier
   * Zeilen passen dort schlicht nicht - dieselbe Enge, derentwegen die
   * Canvas-Uebersicht schwenkt statt zu schrumpfen.
   *
   * Eine weggescrollte Zelle ist erreichbar. Eine verdeckte nicht. Nur um die
   * zweite Sorte geht es hier. Die Zelle ist hier ein echter <button> und damit
   * selbst das Tippziel, also gibt es keine Malflaeche, die fuer sie einspringt.
   */
  [CELL_SELECTORS.pager]: { root: '.pair-page' },
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
  return page.evaluate(({ sel, context }) => {
    const describe = (node: Element | null): string => {
      if (!node) return 'nichts (ausserhalb des Fensters)';
      const id = node.id ? `#${node.id}` : '';
      const cls = typeof node.className === 'string' && node.className
        ? `.${node.className.trim().split(/\s+/).join('.')}` : '';
      return `${node.tagName.toLowerCase()}${id}${cls}`;
    };

    const viewport = context ? document.querySelector(context.root) : null;
    const clip = viewport ? viewport.getBoundingClientRect() : null;

    const found: { index: number; label: string; covering: string }[] = [];
    [...document.querySelectorAll(sel)].forEach((cell, index) => {
      const rect = cell.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;      // unsichtbar: nicht unsere Frage
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      // Ausserhalb des Fensters ist Sache des Scrollens, nicht der Verdeckung.
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return;
      // Ebenso ausserhalb des eigenen Ausschnitts: weggeschwenkt, nicht verdeckt.
      if (clip && (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom)) return;
      const top = document.elementFromPoint(x, y);
      if (top === cell || cell.contains(top)) return;
      // Die Malflaeche der Ansicht zaehlt als die Zelle selbst.
      if (context?.surface && top && top.matches(context.surface)) return;
      found.push({
        index,
        label: cell.getAttribute('aria-label') ?? (cell.textContent ?? '').trim(),
        covering: describe(top),
      });
    });
    return found;
  }, { sel: selector, context: CELL_CONTEXT[selector] ?? null });
}

/**
 * Sichtbare Bedienelemente unter der Tapflaeche von 44 pt.
 *
 * Die Schwelle traegt eine halbe Pixel Nachsicht. `--tap-min: 44px` misst sich
 * als 43.999996185302734 zurueck - ein Rundungsrest aus der float32-Geometrie
 * des Browsers, kein zu kleiner Knopf. Ohne die Nachsicht meldet der Waechter
 * jede korrekt bemessene Leiste, und ein Waechter, der immer schreit, wird
 * abgeschaltet. Ein wirklich zu kleiner Knopf verfehlt die 44 um Pixel, nicht
 * um Millionstel, und faellt weiterhin auf.
 */
const TAP_MIN = 44;
const SUBPIXEL = 0.5;

export async function findUndersizedControls(page: Page) {
  return page.locator('.screen.is-active button:visible').evaluateAll((nodes, floor) => nodes
    .map(node => {
      const rect = node.getBoundingClientRect();
      return { id: node.id || node.className, width: rect.width, height: rect.height };
    })
    .filter(({ width, height }) => width < floor || height < floor), TAP_MIN - SUBPIXEL);
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
  const before = await settledGridRect(page, selector);
  await action();
  const after = await gridRect(page, selector);
  expect(after, 'die Aktion hat das Gitter verschoben oder skaliert').toEqual(before);
}

/**
 * Wartet, bis das Gitter von sich aus zur Ruhe gekommen ist.
 *
 * Das Einpassen laeuft ueber einen ResizeObserver und ist noch nicht fertig,
 * wenn das Canvas zum ersten Mal sichtbar ist - gemessen wandert die Oberkante
 * danach noch um 0.44 px. Ohne dieses Warten vergleicht die Pruefung einen
 * Wert von waehrend des Einpassens mit einem von danach und schiebt die
 * Bewegung der Aktion in die Schuhe, die gar nichts damit zu tun hat.
 */
async function settledGridRect(page: Page, selector: string) {
  let previous = await gridRect(page, selector);
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await page.waitForTimeout(100);
    const current = await gridRect(page, selector);
    if (JSON.stringify(current) === JSON.stringify(previous)) return current;
    previous = current;
  }
  return previous;
}

/** Der Weg von der Startseite bis in ein laufendes Solo-Spiel. */
export async function openSoloPuzzle(page: Page) {
  // Ein Spieler, der schon einmal hier war, hat die Einfuehrung gesehen.
  // Sie gehoert in first-run.spec.ts und nirgendwo sonst.
  await page.addInitScript(() => localStorage.setItem('logicals.seenIntro.v1', '1'));
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
