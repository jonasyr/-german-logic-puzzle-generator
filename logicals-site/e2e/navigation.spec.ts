import { expect, test, type Page } from '@playwright/test';
import { openSoloPuzzle } from './support/layoutGuard';

/*
 * Zurueck ist eine Sache, nicht zwei.
 *
 * Der Zurueck-Knopf des Spiels zeigte fest auf den Heft-Bildschirm, und die
 * System-Geste gab es gar nicht: kein pushState, kein popstate im ganzen
 * Client. Auf Android beendete die Zurueck-Taste die App, auf iOS tat die
 * Randwisch-Geste nichts - in einer Home-Screen-App das auffaelligste unnative
 * Verhalten ueberhaupt.
 *
 * Beide laufen jetzt durch denselben Weg, damit sie nicht verschiedene
 * Antworten geben koennen.
 */

async function withPlayer(page: Page) {
  // Ein Spieler, der schon einmal hier war, hat die Einfuehrung gesehen.
  // Sie gehoert in first-run.spec.ts und nirgendwo sonst.
  await page.addInitScript(() => localStorage.setItem('logicals.seenIntro.v1', '1'));
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

const active = (page: Page) => page.evaluate(() => document.querySelector('.screen.is-active')?.id);

test('die System-Geste geht einen Bildschirm zurueck statt die App zu verlassen', async ({ page }) => {
  test.setTimeout(180_000);
  await openSoloPuzzle(page);

  await page.goBack();
  await expect(page.locator('#screen-config')).toHaveClass(/is-active/);
  await page.goBack();
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
});

test('der Zurueck-Knopf und die Geste tun dasselbe', async ({ page }) => {
  test.setTimeout(180_000);
  await openSoloPuzzle(page);

  await page.locator('#play-back').click();
  expect(await active(page), 'der Knopf').toBe('screen-config');

  await page.locator('#generate-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
  await page.goBack();
  expect(await active(page), 'die Geste').toBe('screen-config');
});

test('nach dem Tagesraetsel fuehrt Zurueck auf den Start', async ({ page }) => {
  test.setTimeout(180_000);
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#daily-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#daily-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });

  // Frueher landete man hier auf einem leeren "Heft", dessen eigene
  // Zurueck-Taste in die Einstellungen fuehrte.
  await page.locator('#play-back').click();
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
});

test('ein neu geladenes Spiel kommt auch ohne Verlauf zurueck', async ({ page }) => {
  test.setTimeout(180_000);
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#daily-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#daily-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });

  // Ein Reload laesst nur einen Eintrag stehen. history.back() wuerde die App
  // verlassen, also muss der Knopf das merken und stattdessen nach Hause gehen.
  await page.reload();
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/, { timeout: 60_000 });
});

test('der Fokus wandert auf die Ueberschrift des neuen Bildschirms', async ({ page }) => {
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#start-button').click();

  // Sonst bleibt er auf dem Knopf, den der Wechsel gerade entfernt hat, und
  // Tastatur wie Screenreader fangen bei jedem Wechsel von vorne an.
  expect(await page.evaluate(() => document.activeElement?.closest('.screen')?.id))
    .toBe('screen-config');
});
