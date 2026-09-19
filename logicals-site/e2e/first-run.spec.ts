import { expect, test, type Page } from '@playwright/test';
import { CELL_SELECTORS, expectStableGrid, findOccludedCells, openSoloPuzzle } from './support/layoutGuard';

/*
 * Die Werkzeuge erklaeren sich nicht von selbst.
 *
 * Ihre Bedeutung stand ausschliesslich im aria-label: ein Screenreader-Nutzer
 * wurde informiert, ein sehender nicht. "␣" fuer loeschen ist nicht erratbar,
 * und die Markierung "vermutet" kam in der Oberflaeche gar nicht vor.
 *
 * Dazu ein stiller vierter Zustand: das aktive Werkzeug erneut zu druecken legt
 * es weg (markTool.js), und danach bleibt jeder Tipp auf dem Gitter wirkungslos
 * - ohne dass irgendwo steht, warum.
 */

/** Ein Spieler, der schon einmal hier war - also ohne Einfuehrung. */
async function returningPlayer(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('logicals.players.v1', JSON.stringify({
      players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
    }));
    localStorage.setItem('logicals.seenIntro.v1', '1');
  });
  await page.route('**/api/players**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-17T00:00:00Z' }] }),
  }));
  await page.route('**/api/players/*/results**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));
}

test('die Einfuehrung erscheint einmal und dann nie wieder', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  // Ohne die Marke: ein Spieler, der zum ersten Mal ein Raetsel oeffnet.
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
  await page.route('**/api/players/*/results**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));

  await page.goto('/');
  await expect(page.locator('#daily-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#daily-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });

  await expect(page.locator('#intro-dialog')).toBeVisible();
  // Alle vier Zeichen werden benannt - "␣" ist das, das niemand erraet.
  for (const symbol of ['×', '○', '·', '␣']) {
    await expect(page.locator('#intro-dialog')).toContainText(symbol);
  }
  await expect(page.locator('#intro-dialog')).toContainText('schließt aus');
  // Und der stille vierte Zustand, der jeden Tipp wirkungslos macht.
  await expect(page.locator('#intro-dialog')).toContainText('legt es weg');
  await page.locator('#intro-close').click();
  await expect(page.locator('#intro-dialog')).toBeHidden();

  // Beim naechsten Raetsel nicht mehr - sonst waere sie eine Huerde statt einer Hilfe.
  await page.locator('#play-back').click();
  await page.locator('#daily-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#intro-dialog')).toBeHidden();
});

test('die Legende steht dauerhaft da und verdeckt nichts', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await returningPlayer(page);
  await openSoloPuzzle(page);

  const legend = page.locator('#tool-legend');
  await expect(legend).toBeVisible();
  for (const word of ['ausgeschlossen', 'sichere Zuordnung', 'vermutet', 'löschen']) {
    await expect(legend).toContainText(word);
  }
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);
});

test('der weggelegte Werkzeug-Zustand wird benannt, ohne das Gitter zu ruehren', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await returningPlayer(page);
  await openSoloPuzzle(page);

  await expectStableGrid(page, '#overview-viewport', async () => {
    // Das aktive Werkzeug erneut druecken legt es weg.
    await page.locator('#overview-mark-no').click();
    await expect(page.locator('#play-status')).toContainText('Kein Werkzeug');
  });
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);

  // Und wieder aufnehmen raeumt die Meldung weg.
  await page.locator('#overview-mark-no').click();
  await expect(page.locator('#play-status')).toBeEmpty();
});
