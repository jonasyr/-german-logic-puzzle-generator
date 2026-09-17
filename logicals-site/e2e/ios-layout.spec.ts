import { expect, test } from '@playwright/test';

const devices = [
  { name: 'iPhone mini', viewport: { width: 375, height: 812 } },
  { name: 'iPhone', viewport: { width: 390, height: 844 } },
  { name: 'iPad', viewport: { width: 768, height: 1024 } },
];

for (const device of devices) {
  test(`${device.name}: touch targets and layout stay inside the viewport`, async ({ page }) => {
    await page.setViewportSize(device.viewport);
    await page.route('**/api/players', route => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-17T00:00:00Z' }] }),
    }));
    await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
      players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
    })));
    await page.goto('/');

    await expect(page.locator('#start-button')).toBeEnabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.locator('#player-button').click();
    const playerDialogLayout = await page.locator('#player-dialog').evaluate(dialog => {
      const dialogRect = dialog.getBoundingClientRect();
      const controls = [...dialog.querySelectorAll<HTMLInputElement | HTMLButtonElement>('.player-form__row > *')];
      return {
        hasHorizontalScroll: dialog.scrollWidth > dialog.clientWidth,
        controlsStayInside: controls.every(control => {
          const rect = control.getBoundingClientRect();
          return rect.left >= dialogRect.left && rect.right <= dialogRect.right;
        }),
      };
    });
    expect(playerDialogLayout).toEqual({ hasHorizontalScroll: false, controlsStayInside: true });
    await page.locator('#player-close').click();

    const undersized = await page.locator('.screen.is-active button:visible').evaluateAll(buttons => buttons
      .map(button => ({ id: button.id, rect: button.getBoundingClientRect().toJSON() }))
      .filter(({ rect }) => rect.width < 44 || rect.height < 44));
    expect(undersized).toEqual([]);

    await page.locator('#start-button').click();
    const firstSelect = page.locator('#field-puzzleCount');
    await firstSelect.focus();
    expect(await firstSelect.evaluate(node => Number.parseFloat(getComputedStyle(node).borderRadius))).toBeGreaterThan(0);
    const titleInput = page.locator('#field-title');
    await titleInput.focus();
    expect(await titleInput.evaluate(node => Number.parseFloat(getComputedStyle(node).borderRadius))).toBeGreaterThan(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.locator('[data-goto="screen-start"]').first().click();
    await page.locator('#duel-join-button').click();
    await expect(page.locator('#screen-duel-entry')).toHaveClass(/is-active/);
    expect(await page.locator('#duel-code').evaluate(node => getComputedStyle(node).fontSize)).toBe('26px');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
