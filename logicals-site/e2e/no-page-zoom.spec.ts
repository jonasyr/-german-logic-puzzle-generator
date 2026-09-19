import { expect, test, type Page } from '@playwright/test';
import { PHONES, openSoloPuzzle } from './support/layoutGuard';

/*
 * Im Spielbildschirm zoomt die Seite nicht. Punkt.
 *
 * Das ist keine Vorliebe, sondern die Bedingung: beim Loesen tippt man
 * dieselben Felder wieder und wieder, und zwei schnelle Tipper sind kein
 * Doppeltippen, sondern zwei Tipper. Wenn die Seite darauf zoomt, ist das
 * Raetsel unterbrochen und es gibt keinen Weg zurueck, der nicht selbst
 * unterbricht.
 *
 * Es gab dafuer schon eine Regel - `touch-action: pan-x pan-y` auf dem
 * Bildschirm - und sie hat trotzdem nicht gehalten. Der Grund ist, dass
 * touch-action nicht vererbt wird: der Browser schneidet die Werte vom
 * getippten Element aufwaerts, aber nur bis zum naechsten Scroll-Container.
 * Jeder `overflow` im Inneren - die Pager-Seite, die Hinweisliste, die
 * Reiterleiste - kappt die Kette, bevor sie oben ankommt. Gemessen standen
 * praktisch alle Elemente im Spielbildschirm auf `auto`.
 *
 * Der frueherer Test hat das nicht gesehen, weil er eine Liste von Elementen
 * aufzaehlte und die Kette selbst bis zur Wurzel nachlief - ein Modell, das
 * grosszuegiger ist als der Browser. Hier wird stattdessen jedes sichtbare
 * Element einzeln gefragt, was fuer es selbst gilt. Was nicht aufgezaehlt
 * werden muss, kann auch nicht vergessen werden.
 */

/** Werte, die weder Doppeltipp-Zoom noch Kneifen erlauben. */
function forbidsPageZoom(value: string): boolean {
  if (value === 'none') return true;
  // `manipulation` erlaubt Kneifen, `auto` beides.
  return /\bpan-/.test(value) && !/pinch-zoom/.test(value);
}

type Offender = { selector: string; touchAction: string };

async function offenders(page: Page): Promise<Offender[]> {
  return page.evaluate(() => {
    const allowed = (value: string) => value === 'none'
      || (/\bpan-/.test(value) && !/pinch-zoom/.test(value));

    const found: { selector: string; touchAction: string }[] = [];
    const screen = document.getElementById('screen-play')!;
    for (const node of [screen, ...screen.querySelectorAll('*')]) {
      const element = node as HTMLElement;
      if (!element.getClientRects().length) continue;   // nicht sichtbar, nicht tippbar
      const touchAction = getComputedStyle(element).touchAction;
      if (allowed(touchAction)) continue;
      const id = element.id ? `#${element.id}` : '';
      const cls = typeof element.className === 'string' && element.className
        ? `.${element.className.trim().split(/\s+/)[0]}` : '';
      found.push({ selector: `${element.tagName.toLowerCase()}${id}${cls}`, touchAction });
    }
    return found;
  });
}

test('die Werte selbst sind so gewaehlt, dass sie Seitenzoom ausschliessen', () => {
  // Die Pruefung unten haengt an dieser Einordnung, also steht sie hier
  // ausdruecklich: `manipulation` reicht nicht, es erlaubt Kneifen.
  expect(forbidsPageZoom('none')).toBe(true);
  expect(forbidsPageZoom('pan-x pan-y')).toBe(true);
  expect(forbidsPageZoom('pan-y')).toBe(true);
  expect(forbidsPageZoom('auto')).toBe(false);
  expect(forbidsPageZoom('manipulation')).toBe(false);
  expect(forbidsPageZoom('pan-x pan-y pinch-zoom')).toBe(false);
});

for (const phone of PHONES) {
  test(`${phone.name}: kein Element im Spiel laesst die Seite zoomen`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(phone.viewport);
    await openSoloPuzzle(page);

    expect(await offenders(page), 'Gesamtansicht').toEqual([]);

    // Der Zettel offen: seine Liste ist ein Scroll-Container und damit genau
    // die Sorte Stelle, an der die Kette bisher riss.
    await page.locator('#sheet-toggle').click();
    await page.waitForTimeout(400);
    expect(await offenders(page), 'Gesamtansicht, Zettel halb offen').toEqual([]);
    await page.locator('#sheet-toggle').click();
    await page.waitForTimeout(400);
    expect(await offenders(page), 'Gesamtansicht, Zettel ganz offen').toEqual([]);

    // Wieder zuklappen, bevor die Ansicht wechselt: im Querformat ist der ganz
    // offene Zettel 92% hoch und deckt die Werkzeugleiste zu. Ein Klick auf
    // einen verdeckten Knopf wartet, bis der Test abläuft.
    await page.locator('#sheet-toggle').click();
    await expect(page.locator('#clues-sheet')).toHaveAttribute('data-detent', 'peek');
    await page.waitForTimeout(400);

    await page.locator('#play-view').click();
    await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
    await page.waitForTimeout(400);
    expect(await offenders(page), 'Einzelansicht').toEqual([]);
  });
}

/*
 * Und das Gitter behaelt seinen eigenen Zoom.
 *
 * Die Zeichenflaeche traegt `none`, weil sie Kneifen selbst auswertet. Das ist
 * die eine Ausnahme, und sie muss eine Ausnahme bleiben: wuerde die Regel oben
 * sie mit erfassen, waere das Raetselgitter das einzige, was nicht mehr zoomt.
 */
test('das Gitter selbst wertet Gesten weiterhin aus', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSoloPuzzle(page);

  expect(await page.locator('#overview-viewport').evaluate(node =>
    getComputedStyle(node).touchAction), 'die Gestenflaeche braucht none').toBe('none');
  expect(await page.locator('#overview-canvas').evaluate(node =>
    getComputedStyle(node).touchAction), 'und das Canvas darin auch').toBe('none');
});
