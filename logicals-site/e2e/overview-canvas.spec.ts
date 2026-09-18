import { expect, test, type Page } from '@playwright/test';

const DEVICES = [
  { name: 'iPhone 13 mini portrait', width: 375, height: 812 },
  { name: 'iPhone 14 portrait', width: 390, height: 844 },
  { name: 'iPhone 13 mini landscape', width: 812, height: 375 },
  { name: 'iPad portrait', width: 768, height: 1024 },
  { name: 'iPad landscape', width: 1024, height: 768 },
];

/** The gutters the canvas is actually drawing with, published by the component. */
async function gutters(page: Page) {
  return page.evaluate(() => {
    const style = getComputedStyle(document.getElementById('overview-viewport')!);
    return {
      left: parseFloat(style.getPropertyValue('--overview-gutter-left')) || 0,
      top: parseFloat(style.getPropertyValue('--overview-gutter-top')) || 0,
    };
  });
}

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

    // Every label has to fit its gutter without being cut to "Fla...". Measured
    // with the same font the renderer uses, against the same gutters it draws.
    const clipped = await page.evaluate(() => {
      const style = getComputedStyle(document.getElementById('overview-viewport')!);
      const left = parseFloat(style.getPropertyValue('--overview-gutter-left'));
      const top = parseFloat(style.getPropertyValue('--overview-gutter-top'));
      const ctx = document.createElement('canvas').getContext('2d')!;
      // The renderer shrinks labels to fit before it ever truncates; 8px is
      // the floor it will not go below, so that is the guarantee to assert.
      ctx.font = '8px system-ui, sans-serif';
      const labels = [...document.querySelectorAll('.overview-mirror__cell')]
        .map(cell => cell.getAttribute('aria-label') ?? '')
        .flatMap(label => {
          const match = label.match(/^Zeile (.+?), Spalte (.+?),/);
          return match ? [{ row: match[1], col: match[2] }] : [];
        });
      const tooWide: string[] = [];
      for (const { row, col } of labels) {
        // Row labels run across the gutter's width, minus the category strip.
        if (ctx.measureText(row).width > left - 21) tooWide.push(row);
        // Column labels are rotated, so they run down the gutter's depth.
        if (ctx.measureText(col).width > top - 12) tooWide.push(col);
      }
      return [...new Set(tooWide)];
    });
    expect(clipped).toEqual([]);

    // Marking has to work on EVERY size, not just the one the interaction tests
    // use. A layout regression once left this viewport 984x2 px on iPad
    // landscape, where no tap could land on a cell at all, and nothing caught it.
    const grid = (await page.locator('#overview-viewport').boundingBox())!;
    const gut = await gutters(page);
    await page.mouse.click(
      grid.x + gut.left + (grid.width - gut.left) * 0.4,
      grid.y + gut.top + (grid.height - gut.top) * 0.4,
    );
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
    const gut = await gutters(page);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    // Only cells fully inside the grid area, clear of the header gutters.
    if (cx < viewport.x + gut.left + 4 || cy < viewport.y + gut.top + 4) continue;
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

test('nothing on the play screen accepts a double-tap zoom', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  // touch-action is NOT inherited, so a child reads 'auto' even under a body
  // that forbids double-tap. What decides the gesture is the INTERSECTION along
  // the ancestor chain up to the scrolling container, so that is what to check.
  // Scoped to buttons and cells as it first was, a double tap on a heading or
  // on the padding between controls still zoomed the page.
  const offenders = await page.evaluate(() => {
    const blocksDoubleTap = (value: string) =>
      value === 'manipulation' || value === 'none'
      || value.startsWith('pan-') || value === 'pinch-zoom';

    const probes = [
      document.body,
      document.getElementById('app')!,
      document.getElementById('screen-play')!,
      document.querySelector('.play-bar h2')!,
      document.getElementById('play-goal')!,
      document.getElementById('overview-viewport')!,
      document.querySelector('.overview-mirror__cell')!,
      document.querySelector('.overview-actions')!,
      document.getElementById('clues-sheet')!,
    ].filter(Boolean);

    const bad: string[] = [];
    for (const probe of probes) {
      let node: Element | null = probe;
      let blocked = false;
      while (node) {
        if (blocksDoubleTap(getComputedStyle(node).touchAction)) { blocked = true; break; }
        node = node.parentElement;
      }
      if (!blocked) {
        bad.push(`${probe.tagName.toLowerCase()}${probe.id ? '#' + probe.id : ''}`);
      }
    }
    return bad;
  });
  expect(offenders).toEqual([]);
});

test('a pinch that straddles the grid and its surroundings cannot zoom the page', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  // WebKit's gesture events are proprietary, so Chromium will not synthesise a
  // real one - but the handler only cares that it is cancelled, and that is
  // exactly what this asserts. The targets matter: a two-finger gesture reports
  // the element under the first touch, or the common ancestor when the fingers
  // straddle two. Bound to the canvas alone, everything but the first of these
  // escaped and Safari zoomed the whole page.
  const prevented = await page.evaluate(() => {
    const targets = [
      document.getElementById('overview-viewport')!,
      document.querySelector('.play-overview')!,
      document.getElementById('play-stage')!,
      document.getElementById('screen-play')!,
      document.getElementById('play-goal')!,
      document.body,
    ];
    return targets.map(target => {
      const event = new Event('gesturestart', { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      const result = { target: target.id || target.tagName.toLowerCase(), prevented: event.defaultPrevented };
      const end = new Event('gestureend', { bubbles: true, cancelable: true });
      target.dispatchEvent(end);
      return result;
    });
  });
  expect(prevented.filter(entry => !entry.prevented)).toEqual([]);
});

test('nothing on the play screen can pinch-zoom the page, clue sheet included', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  // Accidentally zooming the page mid-puzzle happens constantly and cannot be
  // undone without interrupting play, so the whole screen refuses it - the clue
  // sheet too. The grid keeps its own zoom, which is the one that belongs here.
  const prevented = await page.evaluate(() => {
    const targets = [
      document.getElementById('clues-sheet')!,
      document.getElementById('play-clue-list')!,
      document.getElementById('sheet-body')!,
    ];
    return targets.map(target => {
      const event = new Event('gesturestart', { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      target.dispatchEvent(new Event('gestureend', { bubbles: true, cancelable: true }));
      return event.defaultPrevented;
    });
  });
  expect(prevented).toEqual([true, true, true]);

  // And the declarative half: no element under the play screen resolves to a
  // touch-action that still permits pinch-zoom.
  const permits = await page.evaluate(() => {
    const allows = (value: string) => value === 'auto' || value.includes('pinch-zoom')
      || value === 'manipulation';
    const bad: string[] = [];
    for (const probe of [
      document.getElementById('screen-play')!,
      document.getElementById('play-goal')!,
      document.getElementById('clues-sheet')!,
      document.getElementById('play-clue-list')!,
    ]) {
      let node: Element | null = probe;
      let blocked = false;
      while (node) {
        const value = getComputedStyle(node).touchAction;
        if (!allows(value)) { blocked = true; break; }
        node = node.parentElement;
      }
      if (!blocked) bad.push(probe.id || probe.tagName.toLowerCase());
    }
    return bad;
  });
  expect(permits).toEqual([]);
});

test('a release that never reaches the canvas cannot leave a ghost finger', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  const scaleNow = () => cellPx(page);
  const before = await scaleNow();

  // iOS drops a pointerup often enough to matter. A pointer that is never
  // released stays in the map; the next finger then pairs with the ghost, the
  // pinch takes its baseline from a distance that no longer exists, and the grid
  // leaps to a wild scale. Here the release is delivered to the window only,
  // which is the wider net the binder listens on.
  await page.evaluate(() => {
    const viewport = document.getElementById('overview-viewport')!;
    const rect = viewport.getBoundingClientRect();
    const make = (type: string, id: number, x: number, y: number) => new PointerEvent(type, {
      pointerId: id, isPrimary: id === 1, bubbles: true, pointerType: 'touch',
      clientX: rect.left + x, clientY: rect.top + y,
    });
    viewport.dispatchEvent(make('pointerdown', 1, 120, 260));
    viewport.dispatchEvent(make('pointerdown', 2, 200, 260));
    // The canvas never hears about this one.
    window.dispatchEvent(make('pointerup', 2, 200, 260));
    window.dispatchEvent(make('pointerup', 1, 120, 260));

    // A fresh single-finger drag must behave as a plain pan.
    viewport.dispatchEvent(make('pointerdown', 3, 150, 300));
    viewport.dispatchEvent(make('pointermove', 3, 170, 320));
    viewport.dispatchEvent(make('pointerup', 3, 170, 320));
  });
  await page.waitForTimeout(200);

  // Panning must not have changed the scale at all.
  expect(await scaleNow()).toBeCloseTo(before, 3);
});

test('a zoom survives the status line appearing and disappearing', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  // Zoom in, the way a player would before working on one block.
  await page.evaluate(() => {
    const viewport = document.getElementById('overview-viewport')!;
    const rect = viewport.getBoundingClientRect();
    const send = (type: string, id: number, x: number, y: number) => viewport.dispatchEvent(
      new PointerEvent(type, {
        pointerId: id, isPrimary: id === 1, bubbles: true, pointerType: 'touch',
        clientX: rect.left + x, clientY: rect.top + y,
      }),
    );
    send('pointerdown', 1, 150, 300);
    send('pointerdown', 2, 210, 300);
    send('pointermove', 2, 330, 300);
    send('pointerup', 2, 330, 300);
    send('pointerup', 1, 150, 300);
  });
  await page.waitForTimeout(250);
  const zoomed = await cellPx(page);
  expect(zoomed).toBeGreaterThan(20);

  // Mark something, then check: the status line appears, and the stage reflows
  // by a line. That used to refit the grid and throw the zoom away.
  const gut = await gutters(page);
  const grid = (await page.locator('#overview-viewport').boundingBox())!;
  await page.mouse.click(
    grid.x + gut.left + (grid.width - gut.left) * 0.4,
    grid.y + gut.top + (grid.height - gut.top) * 0.4,
  );
  await page.locator('#play-check').click();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#play-status')).not.toBeEmpty();
  await page.waitForTimeout(300);
  expect(await cellPx(page)).toBeCloseTo(zoomed, 1);

  // And when the next mark clears the status line again.
  await page.mouse.click(
    grid.x + gut.left + (grid.width - gut.left) * 0.5,
    grid.y + gut.top + (grid.height - gut.top) * 0.5,
  );
  await page.waitForTimeout(300);
  expect(await cellPx(page)).toBeCloseTo(zoomed, 1);
});

test('a view left at fit scale still re-fits when the screen turns', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);
  const before = await cellPx(page);

  await page.setViewportSize({ width: 812, height: 375 });
  await page.waitForTimeout(400);
  // Untouched, so rotating should re-fill the screen rather than preserve a
  // scale that no longer suits it.
  expect(await cellPx(page)).not.toBeCloseTo(before, 1);
  expect(await cellPx(page)).toBeGreaterThanOrEqual(12.5);
});

test('rapid tapping cannot be read as a double tap, anywhere on the screen', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  const results = await page.evaluate(() => {
    const fire = (target: Element) => {
      const event = new Event('touchend', { bubbles: true, cancelable: true });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const pairAt = (target: Element) => {
      // Separate the pairs in time so one probe does not poison the next.
      const start = performance.now();
      while (performance.now() - start < 450) { /* wait out the window */ }
      return { first: fire(target), second: fire(target) };
    };
    return {
      board: pairAt(document.getElementById('overview-viewport')!),
      goal: pairAt(document.getElementById('play-goal')!),
      readout: pairAt(document.getElementById('overview-readout')!),
      // A tool button needs its synthetic click, and already denies a double-tap
      // zoom through touch-action: manipulation.
      tool: pairAt(document.getElementById('overview-mark-no')!),
    };
  });

  for (const where of ['board', 'goal', 'readout'] as const) {
    expect(results[where].first, where).toBe(false);    // a normal tap goes through
    expect(results[where].second, where).toBe(true);    // the pair is refused
  }
  expect(results.tool.second).toBe(false);              // clicks must survive
});

test('a slow second tap is still a normal tap', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  const prevented = await page.evaluate(async () => {
    const viewport = document.getElementById('overview-viewport')!;
    const fire = () => {
      const event = new Event('touchend', { bubbles: true, cancelable: true });
      viewport.dispatchEvent(event);
      return event.defaultPrevented;
    };
    fire();
    await new Promise(resolve => setTimeout(resolve, 500));
    return fire();
  });
  // Half a second apart is deliberate tapping, not a double tap.
  expect(prevented).toBe(false);
});

test.describe('dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('the grid follows the theme instead of staying a white rectangle', async ({ page }) => {
    test.setTimeout(120_000);
    await openPuzzle(page, 375, 812);

    const theme = await page.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      const parse = (token: string) => {
        const ctx = document.createElement('canvas').getContext('2d')!;
        ctx.fillStyle = style.getPropertyValue(token).trim();
        ctx.fillRect(0, 0, 1, 1);
        const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
        return (r * 299 + g * 587 + b * 114) / 1000;   // perceived brightness
      };
      return { page: parse('--paper'), cell: parse('--grid-cell'), gutter: parse('--grid-gutter') };
    });

    // The grid's surfaces are dark like the page, not the light defaults.
    expect(theme.page).toBeLessThan(80);
    expect(theme.cell).toBeLessThan(80);
    expect(theme.gutter).toBeLessThan(80);
    // And close enough to the page that the canvas does not read as a cut-out.
    expect(Math.abs(theme.cell - theme.page)).toBeLessThan(40);
  });
});

/*
 * The regression that started the layout-stability rule.
 *
 * #play-status collapsed while empty, so Pruefen made it appear, the stage
 * reflowed by a line, the ResizeObserver fired, and the refit discarded the
 * player's zoom. Measuring the viewport across an appearance and a clearing is
 * what would have caught it.
 */
test('showing and clearing the status line does not resize the grid', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  const gridHeight = () => page.evaluate(() =>
    document.getElementById('overview-viewport')!.getBoundingClientRect().height);

  const before = await gridHeight();
  expect(before).toBeGreaterThan(0);

  await page.evaluate(() => { document.getElementById('play-status')!.textContent = 'Eine Meldung'; });
  await page.waitForTimeout(200);
  expect(await gridHeight()).toBeCloseTo(before, 1);

  await page.evaluate(() => { document.getElementById('play-status')!.textContent = ''; });
  await page.waitForTimeout(200);
  expect(await gridHeight()).toBeCloseTo(before, 1);
});

/*
 * The duel equivalent: the opponent's first report arrives mid-game, which is
 * the worst possible moment for the grid to change size under a finger.
 */
test('the opponent progress line is in flow before the first report', async ({ page }) => {
  test.setTimeout(120_000);
  await openPuzzle(page, 375, 812);

  // Solo hides it outright - it never appears, so it can never reflow.
  await expect(page.locator('#duel-progress')).toBeHidden();

  const gridHeight = () => page.evaluate(() =>
    document.getElementById('overview-viewport')!.getBoundingClientRect().height);

  // Simulate the duel case: in flow, empty, then filled.
  await page.evaluate(() => { document.getElementById('duel-progress')!.hidden = false; });
  await page.waitForTimeout(200);
  const reserved = await gridHeight();

  await page.evaluate(() => {
    document.getElementById('duel-progress')!.textContent = 'Gegner: 7 Felder gesetzt';
  });
  await page.waitForTimeout(200);
  expect(await gridHeight()).toBeCloseTo(reserved, 1);
});
