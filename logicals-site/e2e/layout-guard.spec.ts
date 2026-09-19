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
