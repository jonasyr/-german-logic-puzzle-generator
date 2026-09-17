import { expect, test, type Page } from '@playwright/test';

async function selectedPlayer(page: Page, id: number, displayName: string) {
  await page.route('**/api/players', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ players: [{ id, displayName, createdAt: '2026-09-17T00:00:00Z' }] }),
  }));
  await page.addInitScript(({ id, displayName }) => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id, displayName }], selectedPlayerId: id,
  })), { id, displayName });
}

/** Cell size in CSS px, read from the accessible mirror's own transform. */
async function fittedCellPx(page: Page) {
  return page.evaluate(() => {
    const surface = document.querySelector('.overview-mirror__surface') as HTMLElement;
    return 40 * new DOMMatrixReadOnly(getComputedStyle(surface).transform).a;
  });
}

test('runtime generation opens a fitted, touch-safe mobile overview', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  await selectedPlayer(page, 1, 'Ada');
  await page.goto('/');
  await page.locator('#start-button').click();
  await page.locator('#field-puzzleCount').selectOption('1');
  await page.locator('#field-categoryCount').selectOption('5');
  await page.locator('#field-valuesPerCategory').selectOption('5');
  await page.locator('#field-difficulty').selectOption('leicht');
  await page.locator('#generate-button').click();

  await expect(page.locator('.puzzle')).toHaveCount(1, { timeout: 30_000 });
  await expect(page.locator('.puzzle__actions button')).toHaveCount(2);
  await page.getByRole('button', { name: 'Spielen', exact: true }).click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/);
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#overview-canvas')).toBeVisible();
  await page.waitForTimeout(300);

  // The whole grid is shown, and shown large enough that a tap can still be
  // attributed to exactly one cell.
  expect(await fittedCellPx(page)).toBeGreaterThanOrEqual(12.5);

  // Rotating must not break the fit.
  await page.setViewportSize({ width: 812, height: 375 });
  await expect.poll(() => fittedCellPx(page)).toBeGreaterThanOrEqual(12.5);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => fittedCellPx(page)).toBeGreaterThanOrEqual(12.5);

  // Tablet keeps the same view, with room to spare.
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect.poll(() => fittedCellPx(page)).toBeGreaterThanOrEqual(12.5);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(200);

  const toolbarFits = await page.locator('.play-toolbar').evaluate(toolbar => toolbar.scrollWidth <= toolbar.clientWidth);
  expect(toolbarFits).toBe(true);

  // Selecting a cell names both of its values in full and arms the action bar.
  const box = (await page.locator('#overview-viewport').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.55, box.y + box.height * 0.62);
  await expect(page.locator('#overview-readout-pair')).not.toHaveText('Keine Zelle gewählt');
  await expect(page.locator('#overview-mark-yes')).toBeEnabled();

  // Switching views and back preserves the puzzle and the overview.
  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#overview-canvas')).toBeVisible();

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
