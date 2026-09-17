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

test('runtime generation opens a fitted, touch-safe mobile overview', async ({ page }) => {
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
  await expect(page.locator('.play-overview .cell').first()).toBeVisible();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'overview');

  const overviewFit = await page.locator('#grid-scroll').evaluate(scroller => {
    const table = scroller.querySelector('.grid-table')!.getBoundingClientRect();
    const viewport = scroller.getBoundingClientRect();
    return {
      rightFits: table.right <= viewport.right + 1,
      bottomFits: table.bottom <= viewport.bottom + 1,
    };
  });
  expect(overviewFit).toEqual({ rightFits: true, bottomFits: true });
  await expect(page.locator('#grid-scroll')).toHaveAttribute('data-interactive', 'false');
  await expect(page.locator('#overview-zoom-hint')).toBeVisible();
  expect(await page.locator('#grid-zoom').evaluate(node => (node as HTMLElement).inert)).toBe(true);

  await page.setViewportSize({ width: 812, height: 375 });
  await expect.poll(() => page.locator('#grid-scroll').evaluate(scroller => {
    const table = scroller.querySelector('.grid-table')!.getBoundingClientRect();
    const viewport = scroller.getBoundingClientRect();
    return table.right <= viewport.right + 1 && table.bottom <= viewport.bottom + 1;
  })).toBe(true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#zoom-fit').click();

  await page.setViewportSize({ width: 1024, height: 768 });
  await page.locator('#zoom-fit').click();
  await expect(page.locator('#grid-scroll')).toHaveAttribute('data-touch-layout', 'true');
  await expect(page.locator('#grid-scroll')).toHaveAttribute('data-interactive', 'false');
  await page.locator('#grid-scroll').click({ position: { x: 300, y: 220 } });
  await expect(page.locator('#grid-scroll')).toHaveAttribute('data-interactive', 'true');
  expect(await page.locator('.play-overview .cell').first().evaluate(cell => cell.getBoundingClientRect().width)).toBeGreaterThanOrEqual(44);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('#zoom-fit').click();

  const toolbarFits = await page.locator('.play-toolbar').evaluate(toolbar => toolbar.scrollWidth <= toolbar.clientWidth);
  expect(toolbarFits).toBe(true);

  const zoomBeforePinch = Number.parseInt((await page.locator('#zoom-level').textContent()) || '0', 10);
  await page.locator('#grid-scroll').evaluate(scroller => {
    const touch = (identifier: number, clientX: number, clientY: number) => new Touch({
      identifier, target: scroller, clientX, clientY,
    });
    scroller.dispatchEvent(new TouchEvent('touchstart', {
      bubbles: true,
      touches: [touch(1, 100, 200), touch(2, 200, 200)],
    }));
    scroller.dispatchEvent(new TouchEvent('touchmove', {
      bubbles: true,
      cancelable: true,
      touches: [touch(1, 70, 200), touch(2, 230, 200)],
    }));
    scroller.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [] }));
  });
  const zoomAfterPinch = Number.parseInt((await page.locator('#zoom-level').textContent()) || '0', 10);
  expect(zoomAfterPinch).toBeGreaterThan(zoomBeforePinch);

  await page.locator('#grid-scroll').click({ position: { x: 180, y: 180 } });
  await expect(page.locator('#grid-scroll')).toHaveAttribute('data-interactive', 'true');
  expect(await page.locator('#grid-zoom').evaluate(node => (node as HTMLElement).inert)).toBe(false);
  const overviewCell = page.locator('.play-overview .cell').first();
  expect(await overviewCell.evaluate(cell => cell.getBoundingClientRect().width)).toBeGreaterThanOrEqual(44);

  await page.locator('#zoom-in').click();
  const zoomBeforeSwitch = await page.locator('#zoom-level').textContent();
  await expect(page.getByRole('button', { name: 'Gesamtansicht einpassen' })).toBeVisible();
  await page.locator('#grid-scroll').evaluate(scroller => {
    scroller.scrollLeft = Math.min(40, scroller.scrollWidth - scroller.clientWidth);
    scroller.scrollTop = Math.min(60, scroller.scrollHeight - scroller.clientHeight);
  });
  const scrollBeforeSwitch = await page.locator('#grid-scroll').evaluate(scroller => ({
    left: scroller.scrollLeft,
    top: scroller.scrollTop,
  }));
  expect(scrollBeforeSwitch.left + scrollBeforeSwitch.top).toBeGreaterThan(0);

  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'overview');
  await expect(page.locator('#zoom-level')).toHaveText(zoomBeforeSwitch || '');
  expect(await page.locator('#grid-scroll').evaluate(scroller => ({
    left: scroller.scrollLeft,
    top: scroller.scrollTop,
  }))).toEqual(scrollBeforeSwitch);

  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
