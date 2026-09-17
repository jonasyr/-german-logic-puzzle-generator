import { expect, test, type Page } from '@playwright/test';

const DEVICES = [
  { name: 'iPhone 13 mini portrait', width: 375, height: 812 },
  { name: 'iPhone 14 portrait', width: 390, height: 844 },
  { name: 'iPhone 13 mini landscape', width: 812, height: 375 },
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'iPad landscape', width: 1024, height: 768 },
];

/** Cell size in CSS px, read from the accessible mirror's own transform. */
async function cellPx(page: Page) {
  return page.evaluate(() => {
    const surface = document.querySelector('.overview-mirror__surface') as HTMLElement;
    return 40 * new DOMMatrixReadOnly(getComputedStyle(surface).transform).a;
  });
}

async function openPuzzle(page: Page, width: number, height: number, autoCross = true) {
  await page.setViewportSize({ width, height });
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  await page.route('**/api/players', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-17T00:00:00Z' }] }),
  }));
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
  await page.goto('/');
  await page.locator('#start-button').click();
  await page.locator('#field-puzzleCount').selectOption('1');
  await page.locator('#field-categoryCount').selectOption('5');
  await page.locator('#field-valuesPerCategory').selectOption('5');
  await page.locator('#field-difficulty').selectOption('leicht');
  if (!autoCross) await page.locator('#field-autoCross').uncheck();
  await page.locator('#generate-button').click();
  await expect(page.locator('.puzzle')).toHaveCount(1, { timeout: 60_000 });
  await page.getByRole('button', { name: 'Spielen', exact: true }).click();
  await expect(page.locator('#overview-canvas')).toBeVisible();
  await page.waitForTimeout(350);
}

/** Taps the centre of a specific mirror cell, exercising the real hit path. */
async function tapCell(page: Page, index: number) {
  const cell = page.locator('.overview-mirror__cell').nth(index);
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return cell.getAttribute('data-key');
}

for (const device of DEVICES) {
  test(`${device.name}: the whole grid fits above the tap floor`, async ({ page }) => {
    test.setTimeout(120_000);
    await openPuzzle(page, device.width, device.height);

    expect(await cellPx(page)).toBeGreaterThanOrEqual(12.5);

    // All 250 cells of a worst-case puzzle are present, none virtualized away.
    expect(await page.locator('.overview-mirror__cell').count()).toBe(250);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    const undersized = await page.locator('.overview-actions button:visible').evaluateAll(buttons =>
      buttons.map(b => b.getBoundingClientRect()).filter(r => r.width < 44 || r.height < 44));
    expect(undersized).toEqual([]);

    // The grid and the buttons that mark it must be reachable together. On a
    // scrolling page you had to scroll away from the grid to press a mark and
    // back again to see the result, which breaks the select-then-mark loop.
    const together = await page.evaluate(() => {
      const grid = document.getElementById('overview-viewport')!.getBoundingClientRect();
      const bar = document.querySelector('.overview-actions')!.getBoundingClientRect();
      return {
        gridVisible: grid.top >= -1 && grid.bottom <= window.innerHeight + 1,
        barVisible: bar.top >= -1 && bar.bottom <= window.innerHeight + 1,
      };
    });
    expect(together).toEqual({ gridVisible: true, barVisible: true });

    // Marking has to work on EVERY size, not just the one the interaction tests
    // use. A layout regression once left this viewport 984x2 px on iPad
    // landscape, where no tap could land on a cell at all, and nothing caught it.
    const grid = (await page.locator('#overview-viewport').boundingBox())!;
    await page.mouse.click(grid.x + grid.width * 0.55, grid.y + grid.height * 0.6);
    await expect(page.locator('#overview-readout-pair')).not.toHaveText('Keine Zelle gewählt');
    await expect(page.locator('#play-undo')).toBeEnabled();
    await expect(page.locator('#overview-mark-yes')).toBeEnabled();
  });
}

test('the armed tool writes on a tap, and the same tap takes it back', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  // The cross tool is armed on open, because four marks in five are crosses.
  await expect(page.locator('#overview-mark-no')).toHaveAttribute('aria-pressed', 'true');

  const cell = page.locator('.overview-mirror__cell').first();
  const key = await cell.getAttribute('data-key');
  const box = (await cell.boundingBox())!;
  const tap = () => page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const label = () => page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');

  await tap();
  expect(await label()).toContain('ausgeschlossen');
  await expect(page.locator('#overview-readout-pair')).not.toHaveText('Keine Zelle gewählt');

  // Armed on the value the cell already holds, the tool clears it - correcting
  // costs one tap and never produces a surprise third state.
  await tap();
  expect(await label()).toContain('leer');
});

test('arming a different tool changes what a tap writes', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  await page.locator('#overview-mark-yes').click();
  await expect(page.locator('#overview-mark-yes')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#overview-mark-no')).toHaveAttribute('aria-pressed', 'false');

  const key = await tapCell(page, 0);
  const label = await page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(label).toContain('sichere Zuordnung');
});

test('disarming the tool leaves taps as inspection only', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  // Pressing the armed tool disarms it.
  await page.locator('#overview-mark-no').click();
  await expect(page.locator('#overview-mark-no')).toHaveAttribute('aria-pressed', 'false');

  const key = await tapCell(page, 0);
  const label = await page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(label).toContain('leer');
  // It still selects, so the readout names the cell - you just did not change it.
  await expect(page.locator('#overview-readout-pair')).not.toHaveText('Keine Zelle gewählt');
  await expect(page.locator('#play-undo')).toBeDisabled();
});

test('confirming a cell crosses out the rest of its row and column', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  await page.locator('#overview-mark-yes').click();
  const key = (await tapCell(page, 0))!;

  const [catA, catB, valA, valB] = key.split('.').map(Number);
  const implied: string[] = [];
  for (let v = 0; v < 5; v++) {
    if (v !== valB) implied.push(`${catA}.${catB}.${valA}.${v}`);
    if (v !== valA) implied.push(`${catA}.${catB}.${v}.${valB}`);
  }
  expect(implied).toHaveLength(8);

  for (const other of implied) {
    const label = await page.locator(`.overview-mirror__cell[data-key="${other}"]`).getAttribute('aria-label');
    expect(label, other).toContain('ausgeschlossen');
  }

  // One tap is one undo, however many cells it touched.
  await page.locator('#play-undo').click();
  await expect(page.locator('#play-undo')).toBeDisabled();
  for (const other of [key, ...implied]) {
    const label = await page.locator(`.overview-mirror__cell[data-key="${other}"]`).getAttribute('aria-label');
    expect(label, other).toContain('leer');
  }
});

test('the settings switch turns the derived crosses off', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812, false);

  await page.locator('#overview-mark-yes').click();
  const key = (await tapCell(page, 0))!;

  const [catA, catB, valA, valB] = key.split('.').map(Number);
  const neighbour = `${catA}.${catB}.${valA}.${valB === 0 ? 1 : 0}`;

  expect(await page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label'))
    .toContain('sichere Zuordnung');
  // Nothing else was touched.
  expect(await page.locator(`.overview-mirror__cell[data-key="${neighbour}"]`).getAttribute('aria-label'))
    .toContain('leer');
});

test('the switch is remembered for the next puzzle', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812, false);
  await page.goto('/');
  await page.locator('#start-button').click();
  await expect(page.locator('#field-autoCross')).not.toBeChecked();
});

test('a mark made in the overview shows up in the pager', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  const key = await tapCell(page, 0);
  const pagerMark = await page.evaluate(async k => {
    document.getElementById('play-view')!.click();
    await new Promise(resolve => requestAnimationFrame(resolve));
    return document.querySelector(`.play-pager .cell[data-key="${k}"]`)?.textContent ?? '';
  }, key);
  expect(pagerMark).toBe('×');
});

test('a mark made in the pager shows up in the overview', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
  const cell = page.locator('.play-pager .cell').first();
  const key = await cell.getAttribute('data-key');
  await cell.click();

  await page.locator('#play-view').click();
  const label = await page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(label).toContain('ausgeschlossen');
});

test('undo reverts a mark made from the overview', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);
  const key = await tapCell(page, 0);
  await expect(page.locator('#play-undo')).toBeEnabled();
  const label = () => page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(await label()).toContain('ausgeschlossen');

  await page.locator('#play-undo').click();
  await expect(page.locator('#play-undo')).toBeDisabled();
  expect(await label()).toContain('leer');
});

test('hit testing still lands on the right cell after zoom and pan', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  // Zoom in around a point, then pan, using the component's own gesture path.
  await page.evaluate(() => {
    const viewport = document.getElementById('overview-viewport')!;
    const rect = viewport.getBoundingClientRect();
    const send = (type: string, id: number, x: number, y: number) => viewport.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id, isPrimary: id === 1, bubbles: true, pointerType: 'touch',
        clientX: rect.left + x, clientY: rect.top + y,
      }),
    );
    send('pointerdown', 1, 140, 300);
    send('pointerdown', 2, 200, 300);
    send('pointermove', 2, 320, 300);   // spread -> zoom in
    send('pointerup', 2, 320, 300);
    send('pointerup', 1, 140, 300);
    send('pointerdown', 3, 200, 400);
    send('pointermove', 3, 160, 340);   // drag -> pan
    send('pointerup', 3, 160, 340);
  });
  await page.waitForTimeout(200);

  expect(await cellPx(page)).toBeGreaterThan(12.5);

  // Tap a cell by its real on-screen position and check the readout matches the
  // label the mirror carries for that same cell.
  const cells = page.locator('.overview-mirror__cell');
  const count = await cells.count();
  let checked = 0;
  for (let index = 0; index < count && checked < 3; index++) {
    const cell = cells.nth(index);
    const box = await cell.boundingBox();
    if (!box || box.width < 1) continue;
    const viewport = (await page.locator('#overview-viewport').boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Only cells fully inside the grid area, clear of the header gutters.
    if (cx < viewport.x + 90 || cy < viewport.y + 58) continue;
    if (cx > viewport.x + viewport.width - 6 || cy > viewport.y + viewport.height - 6) continue;

    await page.mouse.click(cx, cy);
    const key = await cell.getAttribute('data-key');
    const selectedKey = await page.evaluate(() => document
      .querySelector('.overview-mirror__cell[aria-selected="true"]')?.getAttribute('data-key') ?? null);
    // aria-selected tracks marks, so compare via the readout instead.
    const label = await cell.getAttribute('aria-label');
    const pair = await page.locator('#overview-readout-pair').textContent();
    const [, rowValue] = label!.match(/^Zeile (.+?), Spalte/)!;
    expect(pair).toContain(rowValue);
    void selectedKey; void key;
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
});

test('rotation keeps the grid fitted and above the tap floor', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);
  await page.setViewportSize({ width: 812, height: 375 });
  await expect.poll(() => cellPx(page)).toBeGreaterThanOrEqual(12.5);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.setViewportSize({ width: 375, height: 812 });
  await expect.poll(() => cellPx(page)).toBeGreaterThanOrEqual(12.5);
});
