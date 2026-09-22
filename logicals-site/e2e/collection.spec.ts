import { expect, test, type Page } from '@playwright/test';
import { PHONES, findUndersizedControls, hasHorizontalScroll } from './support/layoutGuard';

/*
 * Die Sammlung macht aus dem Generator ein Heft: endlich, durchblätterbar,
 * abhakbar. Geprüft werden die Wege, auf die es ankommt - nicht ob Funktionen
 * existieren, sondern ob man ankommt, wo man hinwollte, und ob die App
 * hinterher dasselbe behauptet wie man selbst erlebt hat.
 */

async function ada(page: Page, solvedSeeds: number[] = []) {
  await page.addInitScript(() => {
    localStorage.setItem('logicals.players.v1', JSON.stringify({
      players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
    }));
    localStorage.setItem('logicals.seenIntro.v1', '1');
  });
  await page.route('**/api/players', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-17T00:00:00Z' }] }),
  }));
  await page.route('**/api/players/*/results**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));
  await page.route('**/api/players/*/solved-seeds', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ seeds: solvedSeeds }),
  }));
}

test('der Startbildschirm zeigt den Stand, ohne dass man erst hineingeht', async ({ page }) => {
  // Auf einem frischen Gerät ist der Zwischenspeicher leer. Stünde der Stand
  // erst nach dem ersten Besuch der Sammlung da, fehlte er ausgerechnet dort,
  // wo er hingehört.
  await ada(page, [1000001, 1000002]);
  await page.goto('/');
  await expect(page.locator('#collection-detail')).toContainText('2 von 120');
});

test('ohne bekannten Stand steht dort nichts statt einer Null', async ({ page }) => {
  // "0 von 120" wäre keine Zurückhaltung, sondern eine Falschaussage: der
  // Spieler hat vielleicht 40 gelöst, nur weiß dieses Gerät es noch nicht.
  await ada(page, []);
  await page.goto('/');
  await expect(page.locator('#collection-detail')).toBeHidden();
});

test('die erste Handlung ist Weiterspielen, nicht Suchen', async ({ page }) => {
  test.setTimeout(240_000);
  await ada(page, []);
  await page.goto('/');
  await page.locator('#collection-button').click();
  await expect(page.locator('#screen-collection')).toHaveClass(/is-active/);

  // Der Knopf sagt die Handlung, die Zeile darunter das Ziel. Zusammen in
  // einem Knopf ergab das "Weiter: Finale beim Street-Food-Festival, 1" -
  // zwei Zeilen mit einem einsamen ", 1" am Ende.
  const jump = page.locator('#collection-continue');
  await expect(jump).toBeVisible();
  await expect(jump).toHaveText('Weiterspielen');
  await expect(page.locator('#collection-next')).toContainText('Street-Food-Festival');

  await jump.click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });
});

test('ein Kapitel führt in ein Rätsel, und Zurück zeigt den Haken', async ({ page }) => {
  test.setTimeout(240_000);
  let solved: number[] = [];
  await ada(page);
  // Der Server merkt sich, was gelöst wurde - sonst prüft der Test nur sich selbst.
  await page.route('**/api/players/*/solved-seeds', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ seeds: solved }),
  }));

  await page.goto('/');
  await page.locator('#collection-button').click();
  await page.locator('.chapter-row').first().click();
  await expect(page.locator('#screen-chapter')).toHaveClass(/is-active/);
  await expect(page.locator('.entry-row')).toHaveCount(12);
  await expect(page.locator('.entry-row').first()).not.toContainText('gelöst');

  await page.locator('.entry-row').first().click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });

  // Jetzt gilt der Eintrag als gelöst. Zurück muss das zeigen - ohne den
  // Neuaufbau beim Betreten behauptet das Kapitel, er sei noch offen.
  solved = [1000001];
  await page.locator('#play-back').click();
  await expect(page.locator('#screen-chapter')).toHaveClass(/is-active/);
  await expect(page.locator('.entry-row').first()).toContainText('gelöst');
  await expect(page.locator('#chapter-progress')).toContainText('1 von 12');
});

test('die Randwisch-Geste tut dasselbe wie der Zurück-Knopf', async ({ page }) => {
  await ada(page, [1000001]);
  await page.goto('/');
  await page.locator('#collection-button').click();
  await page.locator('.chapter-row').first().click();
  await expect(page.locator('#screen-chapter')).toHaveClass(/is-active/);

  await page.goBack();
  await expect(page.locator('#screen-collection')).toHaveClass(/is-active/);
  await page.goBack();
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
});

test('ohne Netz bleibt die Sammlung benutzbar', async ({ page, context }) => {
  await ada(page, [1000001]);
  await page.goto('/');
  await page.locator('#collection-button').click();
  await expect(page.locator('#collection-total')).toContainText('1 von 120');

  await context.setOffline(true);
  try {
    await page.reload();
    await page.locator('#collection-button').click();
    // Der Haken kommt aus dem Zwischenspeicher, nicht vom Server.
    await expect(page.locator('#screen-collection')).toHaveClass(/is-active/);
    await expect(page.locator('#collection-total')).toContainText('1 von 120');
  } finally {
    await context.setOffline(false);
  }
});

test('der Startbildschirm behält drei Knöpfe im Spielen-Teil', async ({ page }) => {
  /*
   * Die Knopfwand war einmal das Problem, und dieser Test ist die Bremse
   * dagegen. Aus vier wurden drei: „Eigenes Rätsel" steht jetzt unter „Mehr".
   * Es ist kein weiteres Angebot, sondern ein Werkzeug, mit dem man sich
   * selbst eins baut - es stand zwischen den Angeboten, ohne eines zu sein.
   *
   * Sichtbar sind hier drei, weil „Weiterspielen" ohne unterbrochenes Rätsel
   * verborgen bleibt; mit einem sind es vier.
   */
  await ada(page, []);
  await page.goto('/');
  const group = page.locator('#screen-start .start-group').first();
  await expect(group.locator('.btn:visible')).toHaveCount(3);
});

for (const phone of PHONES) {
  test(`${phone.name}: die Sammlung bleibt im Rahmen`, async ({ page }) => {
    await page.setViewportSize(phone.viewport);
    await ada(page, [1000001]);
    await page.goto('/');
    await page.locator('#collection-button').click();
    expect(await findUndersizedControls(page), 'Kapitelübersicht').toEqual([]);
    expect(await hasHorizontalScroll(page), 'Kapitelübersicht').toBe(false);

    await page.locator('.chapter-row').first().click();
    expect(await findUndersizedControls(page), 'Kapitelliste').toEqual([]);
    expect(await hasHorizontalScroll(page), 'Kapitelliste').toBe(false);
  });
}

/*
 * Ein angefangener Eintrag sieht anders aus als ein unberuehrter.
 *
 * Vorher war jeder Eintrag entweder "geloest" oder leer: ein Kapitel mit drei
 * angefangenen Raetseln sah aus wie ein unberuehrtes.
 */
test('die Sammlung zeigt angefangene Raetsel', async ({ page }) => {
  test.setTimeout(240_000);
  await ada(page);
  await page.route('**/api/players/*/solved-seeds', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ seeds: [] }),
  }));

  await page.goto('/');
  await page.locator('#collection-button').click();
  await page.locator('.chapter-row').first().click();
  // Unberuehrt: keine Statuszeile, kein Balken.
  await expect(page.locator('.entry-row').first().locator('.chapter-meter')).toHaveCount(0);

  await page.locator('.entry-row').first().click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });
  // Drei sichere Zuordnungen setzen.
  await page.locator('#overview-mark-yes').evaluate((b: HTMLButtonElement) => b.click());
  await page.locator('.play-pager .cell').evaluateAll(cells => {
    for (const cell of cells.slice(0, 3)) (cell as HTMLButtonElement).click();
  });
  await page.waitForTimeout(300);
  await page.locator('#play-back').click();

  // Jetzt traegt der Eintrag seine Zeile und seinen Balken.
  const ersteZeile = page.locator('.entry-row').first();
  await expect(ersteZeile).toContainText('Angefangen · 3 von 12');
  await expect(ersteZeile.locator('.chapter-meter')).toHaveCount(1);
  // Und hoechstens EINE Statuszeile: der Neu-Hinweis tritt zurueck.
  await expect(ersteZeile.locator('.list-row__meta')).toHaveCount(0);

  // Die Kapiteluebersicht zaehlt es mit.
  await page.locator('#screen-chapter .btn--back').click();
  await expect(page.locator('.chapter-row').first()).toContainText('1 angefangen');
});
