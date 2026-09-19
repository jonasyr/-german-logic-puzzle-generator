import { expect, test, type Page } from '@playwright/test';
import { CELL_SELECTORS, findOccludedCells, openSoloPuzzle } from './support/layoutGuard';

/*
 * Spiel-Vorlieben gehoeren nicht in den Erzeugen-Ablauf.
 *
 * Sie lagen dort: um die Uhr auszublenden, musste man "Raetsel erstellen"
 * druecken. Sie gelten aber auch fuers Tagesraetsel, dessen Weg diesen
 * Bildschirm nie passiert - und mitten im Spiel war gar nichts aenderbar,
 * obwohl derivesCrosses() die Vorliebe bei jeder Aktion ohnehin neu liest.
 */

async function withPlayer(page: Page) {
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
}

test('Vorlieben sind vom Start aus erreichbar, ohne den Erzeugen-Ablauf', async ({ page }) => {
  await withPlayer(page);
  await page.goto('/');
  await page.locator('#settings-button').click();
  await expect(page.locator('#screen-settings')).toHaveClass(/is-active/);
  await expect(page.locator('#screen-config')).not.toHaveClass(/is-active/);

  // Und die Raetsel-Parameter sind hier nicht - der Bildschirm beschreibt, wie
  // gespielt wird, nicht was erzeugt wird.
  await expect(page.locator('#field-seed')).toBeHidden();
  await expect(page.locator('#field-hideClock')).toBeVisible();
});

test('die Vorliebe wirkt im laufenden Spiel und verschiebt das Gitter nicht', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSoloPuzzle(page);
  await expect(page.locator('#play-timer')).toBeVisible();

  await page.locator('#play-settings').click();
  await expect(page.locator('#screen-settings')).toHaveClass(/is-active/);
  await page.locator('#field-hideClock').check();
  await page.goBack();

  await expect(page.locator('#screen-play')).toHaveClass(/is-active/);
  await expect(page.locator('#play-timer')).toBeHidden();
  // Eine verschwindende Uhr darf das Gitter nicht verdecken.
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);
});

test('das Zahnrad verlaesst ein Duell nicht, also fragt es auch nicht', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSoloPuzzle(page);

  // Im Solo ohnehin keine Rueckfrage; hier zaehlt, dass der Weg hin und zurueck
  // das Spiel unveraendert laesst.
  await page.locator('#play-settings').click();
  await expect(page.locator('#screen-settings')).toHaveClass(/is-active/);
  await page.goBack();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/);
  await expect(page.locator('#overview-canvas')).toBeVisible();
});

test('die gespeicherte Vorliebe ueberlebt einen Neustart', async ({ page }) => {
  await withPlayer(page);
  await page.goto('/');
  await page.locator('#settings-button').click();
  await page.locator('#field-autoCross').uncheck();

  await page.reload();
  await page.locator('#settings-button').click();
  await expect(page.locator('#field-autoCross')).not.toBeChecked();
});
