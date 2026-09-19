import { expect, test } from '@playwright/test';

/*
 * Der halb hochgezogene Hinweis-Zettel muss scrollen.
 *
 * Er tat es nicht: `overflow-y: auto` hing allein am vollen Detent. Die
 * Begruendung dafuer war richtig - bei "halb" ist der Zettel um 45% seiner
 * Hoehe nach unten geschoben, der untere Teil liegt also unter dem
 * Bildschirmrand, und Scrollen haette Inhalt bewegt, den niemand sieht.
 *
 * Nur folgt daraus nicht, dass "halb" nicht scrollen darf, sondern dass der
 * Koerper bei "halb" die sichtbare Hoehe bekommen muss statt der vollen. Sonst
 * hat die mittlere Raste keinen Zweck: man sieht die ersten Hinweise und kommt
 * an die restlichen nur, indem man ganz aufzieht - und verdeckt damit das
 * Gitter, das man beim Lesen ja gerade vergleichen will.
 */

async function openPuzzleWithManyClues(page: import('@playwright/test').Page) {
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

  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#start-button').click();
  // 5x5: genug Hinweise, damit die Liste die sichtbare Hoehe sicher ueberlaeuft.
  await page.locator('#field-categoryCount').selectOption('5');
  await page.locator('#field-valuesPerCategory').selectOption('5');
  await page.locator('#field-difficulty').selectOption('leicht');
  await page.locator('#generate-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
}

const metrics = (page: import('@playwright/test').Page) => page.locator('#sheet-body').evaluate(node => ({
  overflowY: getComputedStyle(node).overflowY,
  scrollable: node.scrollHeight - node.clientHeight,
  clientHeight: node.clientHeight,
  // Wie viel des Koerpers ueberhaupt im Fenster liegt.
  visible: Math.max(0, Math.min(window.innerHeight, node.getBoundingClientRect().bottom)
    - Math.max(0, node.getBoundingClientRect().top)),
}));

test('der halb offene Zettel laesst sich scrollen', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPuzzleWithManyClues(page);

  // Ein Tipp auf den Kopf geht von "peek" auf "halb".
  await page.locator('#sheet-toggle').click();
  await expect(page.locator('#clues-sheet')).toHaveAttribute('data-detent', 'half');
  await page.waitForTimeout(400);   // die Rast-Animation

  const half = await metrics(page);
  expect(half.overflowY, 'der halb offene Zettel muss scrollen duerfen').toBe('auto');
  expect(half.scrollable, 'sonst belegt der Test nichts - die Liste muss ueberlaufen')
    .toBeGreaterThan(20);

  // Der Koerper darf nicht hoeher sein als das, was vom Zettel zu sehen ist,
  // sonst scrollt man Inhalt unter den Bildschirmrand statt ins Blickfeld.
  expect(half.clientHeight, 'der Koerper ragt unter den Bildschirmrand')
    .toBeLessThanOrEqual(Math.ceil(half.visible) + 2);

  await page.locator('#sheet-body').evaluate(node => { node.scrollTop = 60; });
  expect(await page.locator('#sheet-body').evaluate(node => node.scrollTop),
    'die Liste hat sich nicht bewegt').toBeGreaterThan(0);
});

test('ganz aufziehen scrollt weiterhin und behaelt die Stelle', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openPuzzleWithManyClues(page);

  await page.locator('#sheet-toggle').click();          // halb
  await page.waitForTimeout(400);
  await page.locator('#sheet-body').evaluate(node => { node.scrollTop = 60; });

  await page.locator('#sheet-toggle').click();          // ganz
  await expect(page.locator('#clues-sheet')).toHaveAttribute('data-detent', 'full');
  await page.waitForTimeout(400);

  // Zwischen halb und ganz zu wechseln darf die Leseposition nicht verwerfen.
  expect(await page.locator('#sheet-body').evaluate(node => node.scrollTop),
    'der Wechsel halb -> ganz hat die Stelle verloren').toBeGreaterThan(0);
  expect((await metrics(page)).overflowY).toBe('auto');

  // Zuklappen setzt weiterhin zurueck, damit das naechste Oeffnen oben beginnt.
  await page.locator('#sheet-toggle').click();          // peek
  await page.waitForTimeout(400);
  expect(await page.locator('#sheet-body').evaluate(node => node.scrollTop)).toBe(0);
});
