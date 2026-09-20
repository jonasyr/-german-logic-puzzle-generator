import { expect, type Page } from '@playwright/test';

/*
 * Die Layout-Invarianten dieser App, an einem Ort.
 *
 * Die Statuszeile des Spielbildschirms war zweimal falsch platziert, bevor sie
 * sass - einmal ueber den Spaltenkoepfen, einmal mitten im Gitter im Querformat.
 * Beide Male waren alle Tests gruen. Was gefehlt hat, war nicht Sorgfalt,
 * sondern eine Pruefung.
 */

/*
 * 320px steht hier, weil die Leiste dort zuerst bricht.
 *
 * Die schmalste unterstuetzte Breite fehlte, und genau sie hat als erste
 * nachgegeben: sechs Spalten Werkzeugleiste ergeben im Satzspiegel von 320px
 * rechnerisch 43.3px pro Knopf. Der Waechter, der ab 375px anfing, sah davon
 * nichts. Die schmalste Breite ist die, an der sich alles entscheidet.
 */
export const PHONES = [
  { name: 'iPhone SE', viewport: { width: 320, height: 568 } },
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
 * `elementFromPoint` respektiert `pointer-events: none`. Ein Element, das einen
 * Tipp schluckt, traegt das nicht und faellt hier auf.
 *
 * ACHTUNG, das ist nur die halbe Frage. Ein Element mit `pointer-events: none`
 * laesst den Tipp durch und ist fuer diesen Waechter unsichtbar - es kann die
 * Zelle trotzdem vollstaendig verdecken. Genau so kam die Pruef-Meldung durch:
 * sie lag deckend ueber der Zeile, deren falsche Markierung sie ankuendigte,
 * und blieb hier gruen. Fuer die Sicht ist `findVeiledCells` zustaendig.
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
 * Zellen, die ein deckendes Element verhuellt - auch wenn der Tipp durchgeht.
 *
 * Die Gegenprobe zu `findOccludedCells`. Dort zaehlt, was einen Tipp schluckt;
 * hier zaehlt, was die Sicht nimmt. Der Unterschied ist keine Feinheit: eine
 * Meldung mit `pointer-events: none` laesst jeden Tipp durch und verdeckt die
 * Zelle trotzdem. Wer nach dem Pruefen erfaehrt, eine Markierung sei
 * hervorgehoben, und die Hervorhebung liegt unter der Meldung, hat von beidem
 * nichts.
 *
 * Gesucht werden sichtbare Elemente mit deckendem Hintergrund, die sich mit
 * einer Zelle ueberlappen. Die Zelle gilt als verhuellt, sobald mehr als ein
 * Drittel ihrer Flaeche darunter liegt - ein Streifen am Rand ist Layout,
 * ein Drittel ist Verlust.
 */
export async function findVeiledCells(page: Page, selector: string): Promise<Occlusion[]> {
  return page.evaluate(({ sel, veilLimit, context }) => {
    const describe = (node: Element): string => {
      const id = node.id ? `#${node.id}` : '';
      const cls = typeof node.className === 'string' && node.className
        ? `.${node.className.trim().split(/\s+/).join('.')}` : '';
      return `${node.tagName.toLowerCase()}${id}${cls}`;
    };

    /* Deckend heisst: eigener Hintergrund mit Alpha, sichtbar, nicht leer. */
    const veils = [...document.querySelectorAll<HTMLElement>('body *')].filter(node => {
      const style = getComputedStyle(node);
      if (style.visibility === 'hidden' || style.display === 'none') return false;
      if (Number(style.opacity) < 0.5) return false;
      const bg = style.backgroundColor;
      const alpha = bg.startsWith('rgba') ? Number(bg.split(',')[3]?.replace(')', '') ?? '1') : 1;
      if (bg === 'transparent' || alpha < 0.5) return false;
      const rect = node.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });

    /*
     * Dieselbe Grenze wie in findOccludedCells: weggescrollt ist nicht
     * verdeckt. Eine Zelle, die unter dem Hinweisblatt liegt, weil das Gitter
     * dorthin gescrollt ist, bleibt einen Wisch entfernt erreichbar. Ohne
     * diesen Ausschluss meldet der Waechter das halbe Gitter und wird damit
     * wertlos - ein Waechter, der immer schreit, wird abgeschaltet.
     */
    const viewport = context ? document.querySelector(context.root) : null;
    const clip = viewport ? viewport.getBoundingClientRect() : null;

    const found: { index: number; label: string; covering: string }[] = [];
    [...document.querySelectorAll(sel)].forEach((cell, index) => {
      const rect = cell.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return;
      if (clip && (x < clip.left || x > clip.right || y < clip.top || y > clip.bottom)) return;
      const area = rect.width * rect.height;
      for (const veil of veils) {
        if (veil.contains(cell) || cell.contains(veil)) continue;  // Vorfahr, kein Schleier
        const other = veil.getBoundingClientRect();
        const overlap = Math.max(0, Math.min(rect.right, other.right) - Math.max(rect.left, other.left))
          * Math.max(0, Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top));
        if (overlap / area <= veilLimit) continue;
        found.push({
          index,
          label: cell.getAttribute('aria-label') ?? (cell.textContent ?? '').trim(),
          covering: describe(veil),
        });
        return;
      }
    });
    return found;
  }, { sel: selector, veilLimit: 1 / 3, context: CELL_CONTEXT[selector] ?? null });
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
