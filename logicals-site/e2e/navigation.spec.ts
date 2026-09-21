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

test('Zurueck verlaesst die App nicht, wenn es nichts zu poppen gibt', async ({ page }) => {
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 30_000 });

  /*
   * Der Fall, den eine Home-Screen-App staendig erlebt: iOS wirft sie aus dem
   * Speicher, sie startet neu, und es gibt keinen eigenen History-Eintrag mehr.
   * history.back() wuerde dann aus der App heraus navigieren - in einem Fenster
   * ohne Adressleiste ein Sackgassen-Bildschirm, aus dem es keinen Weg zurueck
   * gibt. goBack() muss das erkennen.
   *
   * Direkt am Router geprueft: der Startbildschirm hat keinen Zurueck-Knopf,
   * ueber den man den Fall sonst erreichen koennte.
   */
  await page.evaluate(async () => {
    const router = await import('/js/router.js');
    router.goBack();
  });
  await page.waitForTimeout(300);

  await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
  // Immer noch die App und nicht about:blank.
  expect(await page.title()).toContain('Logicals');
});

test('ein Rueckwurf aus dem Speicher laesst das Spiel wiederfinden', async ({ page }) => {
  test.setTimeout(180_000);
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#daily-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#daily-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });

  // Eine Markierung setzen, damit es etwas gibt, wozu man zurueckkehren wollte.
  // Erst nach dem Einpassen: bis dahin wandert das Gitter noch unter dem Finger.
  await page.waitForTimeout(400);
  const cell = page.locator('.overview-mirror__cell').first();
  const key = await cell.getAttribute('data-key');
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const marked = page.locator(`.overview-mirror__cell[data-key="${key}"]`);
  await expect(marked).toHaveAttribute('aria-label', /ausgeschlossen/);

  // Der Reload steht fuer die Verdraengung aus dem Speicher.
  await page.reload();
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/, { timeout: 60_000 });

  // Nicht das Spiel selbst - aber ein Weg zurueck hinein, sonst ist die
  // Verdraengung ein Verlust statt einer Unterbrechung.
  await expect(page.locator('#resume-button')).toBeVisible();
  await page.locator('#resume-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });

  /*
   * Die Markierung ist wieder da - darauf kommt es an.
   *
   * Die Rücknahme-Historie überlebt den Neustart bewusst nicht: sie gehört zur
   * Sitzung, nicht zum Spielstand. Erst dieser Test hat mich das nachsehen
   * lassen, statt es anzunehmen.
   */
  await expect(page.locator(`.overview-mirror__cell[data-key="${key}"]`))
    .toHaveAttribute('aria-label', /ausgeschlossen/, { timeout: 30_000 });
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

/*
 * Der Startbildschirm ist gruppiert.
 *
 * Er trug sieben gleich aussehende Knoepfe untereinander: spielen, beitreten,
 * nachschlagen und einstellen in einer Reihe, ohne dass etwas sagte, welcher
 * wozu gehoert. Die Identitaet ("Spieler auswaehlen") stand dabei ganz oben und
 * damit vor dem, weswegen man die App oeffnet.
 */
test('der Startbildschirm ordnet seine Knoepfe in benannte Gruppen', async ({ page }) => {
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 30_000 });

  const groups = page.locator('#screen-start .start-group');
  await expect(groups).toHaveCount(2);
  await expect(groups.nth(0)).toContainText('Spielen');
  await expect(groups.nth(1)).toContainText('Mehr');

  /*
   * Unter "Spielen" stehen nur Angebote - Wege, die einem ein Raetsel geben.
   * Sie unterscheiden sich in der ART: das heutige, das lange Vorhaben, zu
   * zweit (und "Weiterspielen", wenn eines offen ist).
   */
  const play = groups.nth(0);
  for (const id of ['#resume-button', '#daily-button', '#collection-button', '#duel-join-button']) {
    await expect(play.locator(id)).toHaveCount(1);
  }
  /*
   * Unter "Mehr" steht, was kein Angebot ist: nachschlagen, einstellen - und
   * "Eigenes Raetsel", ein Werkzeug, mit dem man sich selbst eins baut. Es
   * stand frueher zwischen den Angeboten, ohne eines zu sein.
   */
  const more = groups.nth(1);
  for (const id of ['#start-button', '#history-button', '#settings-button']) {
    await expect(more.locator(id)).toHaveCount(1);
  }

  // Die Identitaet steht nicht mehr vor dem Spielen, sondern als Zeile am Kopf.
  const playerBox = (await page.locator('#player-button').boundingBox())!;
  const dailyBox = (await page.locator('#daily-button').boundingBox())!;
  expect(playerBox.height, 'der Spielerknopf ist kein Hauptknopf mehr')
    .toBeLessThan(dailyBox.height);
});

test('die Gruppen ueberleben das Ausblenden der Duell-Funktionen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('logicals.prefs.v1', JSON.stringify({
    autoCross: true, hideClock: false, hideDuel: true,
  })));
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#start-button')).toBeEnabled({ timeout: 30_000 });

  await expect(page.locator('#duel-join-button')).toBeHidden();
  // Eine leere Gruppe waere schlimmer als keine: die Ueberschrift bleibt nur,
  // solange noch etwas darunter steht.
  await expect(page.locator('#screen-start .start-group')).toHaveCount(2);
  await expect(page.locator('#daily-button')).toBeVisible();
});
