import { expect, test, type Page } from '@playwright/test';

/*
 * The daily puzzle and the statistics screen.
 *
 * Both are derived rather than stored, so the interesting assertions are about
 * agreement: two devices agreeing on today's puzzle, and the screen agreeing
 * with the results it was given.
 */

type Result = Record<string, unknown>;

async function withPlayer(page: Page, results: Result[] = []) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  await page.route('**/api/players', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-18T00:00:00Z' }] }),
  }));
  await page.route('**/api/players/1/results*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results }),
  }));
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
}

/** The date, seed and difficulty the app itself derives - asked of the app. */
async function today(page: Page) {
  return page.evaluate(async () => {
    const daily = await import('/js/play/dailyPuzzle.js');
    const date = daily.berlinDate();
    return { date, seed: daily.dailySeed(date), difficulty: daily.dailyDifficulty(date) };
  });
}

/** A history of daily results ending today, newest first. */
async function dailyHistory(page: Page, days: number[], elapsedMs = 492_000) {
  return page.evaluate(async ({ days, elapsedMs }) => {
    const daily = await import('/js/play/dailyPuzzle.js');
    const date = daily.berlinDate();
    const back = (offset: number) => {
      const moment = new Date(`${date}T12:00:00Z`);
      moment.setUTCDate(moment.getUTCDate() - offset);
      return moment.toISOString().slice(0, 10);
    };
    return days.map((offset, index) => ({
      id: index + 1, playerId: 1, roomId: null, attemptKey: `k${offset}`,
      puzzleFingerprint: 'f', puzzleTitle: 'Tagesrätsel', themeId: 'standard',
      difficulty: daily.dailyDifficulty(back(offset)), seed: daily.dailySeed(back(offset)),
      configuration: { categoryCount: 5, valuesPerCategory: 5 },
      elapsedMs, failedChecks: 1,
      completedAt: `${back(offset)}T12:00:00.000Z`,
      opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
    }));
  }, { days, elapsedMs });
}

test('one tap starts today\'s puzzle, with no form in between', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');

  const daily = await today(page);
  // The difficulty is stated before the puzzle opens, so it is never a surprise.
  await expect(page.locator('#daily-detail')).toContainText(daily.difficulty);

  await page.locator('#daily-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
  // Straight into the grid: the settings screen was never shown.
  await expect(page.locator('#screen-config')).not.toHaveClass(/is-active/);
});

test('two timezones get the same daily puzzle', async ({ browser }) => {
  test.setTimeout(240_000);
  const titles: string[] = [];
  for (const timezoneId of ['Europe/Berlin', 'America/New_York']) {
    const context = await browser.newContext({ timezoneId, viewport: { width: 375, height: 812 } });
    const page = await context.newPage();
    await withPlayer(page);
    await page.goto('/');
    await page.locator('#daily-button').click();
    await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
    titles.push((await page.locator('#play-title').textContent()) ?? '');
    await context.close();
  }
  // Comparability is the entire point; travelling must not change the puzzle.
  expect(titles[0]).not.toBe('');
  expect(titles[0]).toBe(titles[1]);
});

test('a solved daily says so, with the streak', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');

  // Today and the two days before it - 8:12 each.
  const history = await dailyHistory(page, [0, 1, 2]);
  await withPlayer(page, history);
  await page.reload();

  await expect(page.locator('#daily-button')).toHaveText('Nochmal spielen');
  await expect(page.locator('#daily-detail')).toContainText('Heute gelöst · 8:12');
  await expect(page.locator('#daily-detail')).toContainText('Serie: 3 Tage');
});

test('today being unplayed does not break a running streak', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');

  // Yesterday and the day before, but not today: the day is not over yet.
  const history = await dailyHistory(page, [1, 2]);
  await withPlayer(page, history);
  await page.reload();

  await expect(page.locator('#daily-button')).toHaveText('Rätsel des Tages');
  await expect(page.locator('#daily-detail')).toContainText('Serie: 2 Tage');
  await expect(page.locator('#daily-detail')).not.toContainText('Heute gelöst');
});

test('an unreachable history still leaves the daily puzzle playable', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.route('**/api/players/1/results*', route => route.abort());
  await page.goto('/');

  // Generating needs no network, so a dead history must not disable the button.
  await expect(page.locator('#daily-button')).toBeEnabled();
  await page.locator('#daily-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
});
