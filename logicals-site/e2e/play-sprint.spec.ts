import { expect, test, type Page } from '@playwright/test';

async function withPlayer(page: Page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  await page.route('**/api/players', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-18T00:00:00Z' }] }),
  }));
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
}

async function generateAndPlay(page: Page) {
  await page.locator('#start-button').click();
  await page.locator('#field-puzzleCount').selectOption('1');
  await page.locator('#field-categoryCount').selectOption('5');
  await page.locator('#field-valuesPerCategory').selectOption('5');
  await page.locator('#field-difficulty').selectOption('leicht');
  await page.locator('#generate-button').click();
  await expect(page.locator('.puzzle')).toHaveCount(1, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Spielen', exact: true }).click();
  await expect(page.locator('#overview-canvas')).toBeVisible();
  await page.waitForTimeout(350);
}

/** Taps a mirror cell by index, which drives the real hit path. */
async function tapCell(page: Page, index: number) {
  const cell = page.locator('.overview-mirror__cell').nth(index);
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return cell.getAttribute('data-key');
}

test('a game in progress can be resumed after a reload', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  const title = await page.locator('#play-title').textContent();
  const key = await tapCell(page, 0);
  await tapCell(page, 1);
  await page.waitForTimeout(200);

  await page.reload();
  const resume = page.locator('#resume-button');
  await expect(resume).toBeVisible();
  await expect(page.locator('#resume-detail')).toContainText('Markierungen');

  await resume.click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
  // The same puzzle, and the same marks on it.
  await expect(page.locator('#play-title')).toHaveText(title || '');
  const label = await page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(label).toContain('ausgeschlossen');
});

test('an empty grid offers nothing to resume', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.reload();
  await expect(page.locator('#resume-button')).toBeHidden();
});

test('a record that cannot be rebuilt is refused and cleared', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);
  await tapCell(page, 0);
  await page.waitForTimeout(200);

  await page.reload();
  await expect(page.locator('#resume-button')).toBeVisible();

  // Corrupt the fingerprint AFTER the reload. Doing it before is pointless: the
  // page's own pagehide handler persists the live game on the way out and would
  // simply write the correct fingerprint back over it.
  await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('logicals.resume.v1')!);
    record.fingerprint = 'not-the-right-fingerprint';
    localStorage.setItem('logicals.resume.v1', JSON.stringify(record));
  });

  await page.locator('#resume-button').click();
  await expect(page.locator('#start-hint')).toContainText('identisch erzeugen', { timeout: 60_000 });
  // And it does not stay around to fail again.
  await expect(page.locator('#resume-button')).toBeHidden();
});

test('a solved puzzle is not offered for resuming', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);
  await tapCell(page, 0);
  await page.waitForTimeout(200);
  await expect(page.locator('#play-undo')).toBeEnabled();

  // Emptying the grid is the same signal as solving it: there is nothing to
  // come back to.
  await page.locator('#play-clear').click();
  await page.locator('#confirm-ok').click();
  await page.waitForTimeout(200);

  await page.reload();
  await expect(page.locator('#resume-button')).toBeHidden();
});

test('a note can be placed and cleared, and survives a reload', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.locator('#overview-mark-maybe').click();
  const key = await tapCell(page, 0);
  const label = () => page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(await label()).toContain('vermutet');

  await page.reload();
  await page.locator('#resume-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
  expect(await label()).toContain('vermutet');

  // Armed on what the cell already holds, the same tool takes it back off.
  await page.locator('#overview-mark-maybe').click();
  await tapCell(page, 0);
  expect(await label()).toContain('leer');
});

test('the pager marks with the same tool as the overview', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.locator('#overview-mark-maybe').click();
  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');

  const cell = page.locator('.play-pager .cell').first();
  const key = await cell.getAttribute('data-key');
  await cell.click();
  // The pager used to cycle to a cross here regardless of the armed tool.
  await expect(cell).toHaveText('·');

  await page.locator('#play-view').click();
  const label = await page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(label).toContain('vermutet');
});

test('a note is never reported as a wrong mark', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.locator('#overview-mark-maybe').click();
  for (const index of [0, 1, 2, 3]) await tapCell(page, index);

  await page.locator('#play-check').click();
  await page.locator('#confirm-ok').click();
  // Notes are uncertainty, not claims: checking cannot find fault with them.
  await expect(page.locator('#play-status')).not.toContainText('stimmt nicht');
  await expect(page.locator('#play-status')).not.toContainText('stimmen nicht');
});

test('solving a puzzle is acknowledged, with a way back to the start', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.route('**/api/results', route => route.fulfill({
    status: 201, contentType: 'application/json', body: '{"result":{}}',
  }));
  await page.goto('/');
  await generateAndPlay(page);

  // Solve it from the solution table, the way the duel spec does.
  await page.locator('#play-solution-button').evaluate((button: HTMLButtonElement) => button.click());
  await page.locator('#confirm-ok').click();
  const labels = await page.locator('#play-solution-table').evaluate(container => {
    const headers = [...container.querySelectorAll('th')].map(cell => cell.textContent || '');
    return [...container.querySelectorAll('tbody tr')].flatMap(row => {
      const values = [...row.querySelectorAll('td')].map(cell => cell.textContent || '');
      return headers.flatMap((_, left) => headers.slice(left + 1).map((__, offset) =>
        `${values[left]} / ${values[left + offset + 1]}`));
    });
  });
  await page.locator('#overview-mark-yes').evaluate((button: HTMLButtonElement) => button.click());
  await page.locator('.play-pager .cell').evaluateAll((cells, wanted) => {
    for (const label of wanted as string[]) {
      const cell = cells.find(c => (c as HTMLElement).dataset.label === label) as HTMLButtonElement;
      cell.click();
    }
  }, labels);

  const solved = page.locator('#solved-dialog');
  await expect(solved).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#solved-title')).toHaveText('Geschafft!');
  await expect(page.locator('#solved-puzzle')).not.toBeEmpty();
  // The numbers worth keeping, not just a cheer.
  await expect(page.locator('#solved-time')).toHaveText(/^\d+:\d{2}$/);
  await expect(page.locator('#solved-checks')).toHaveText(/^\d+$/);
  await expect(page.locator('#solved-marks')).toHaveText(/^\d+$/);

  await page.locator('#solved-home').click();
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
  // A solved puzzle is not something to come back to.
  await expect(page.locator('#resume-button')).toBeHidden();
});
