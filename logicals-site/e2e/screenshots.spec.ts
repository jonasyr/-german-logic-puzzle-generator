/*
 * Aufnahmestrecke fuer die Durchsicht. Laeuft NICHT im normalen Lauf.
 *
 * Sie schreibt 72 Bilder und prueft nichts - als Teil der Suite waere sie
 * reine Last. Mit `SHOTS=1 npx playwright test screenshots` nimmt sie auf,
 * sonst ueberspringt sie sich selbst. (Versehentlich war sie eine Weile
 * Pflichtprogramm, weil ein `git add -A` sie mitgenommen hat.)
 *
 * Nimmt jeden Bildschirm in vier Varianten auf, damit ein Mensch (oder ein
 * Pruefer) sie nebeneinander legen kann. Die 13 Bildschirme der ersten
 * Durchsicht plus die Zustaende, die damals fehlten: ganz geoeffnetes
 * Hinweisblatt (traegt seit neuestem die Zielfrage), Pause, Loesung, der
 * Geloest-Dialog, die Einfuehrung, der Spieler-Dialog - und das Querformat.
 */
import { expect, test, type Page } from '@playwright/test';

test.skip(!process.env.SHOTS, 'Aufnahmestrecke - mit SHOTS=1 starten');

const SOLVED = [1000001, 1000002, 1010001];

async function seed(page: Page, opts: { intro?: boolean; player?: boolean } = {}) {
  const { intro = true, player = true } = opts;
  await page.addInitScript(([seenIntro, hasPlayer, solved]) => {
    if (seenIntro) localStorage.setItem('logicals.seenIntro.v1', '1');
    if (hasPlayer) {
      localStorage.setItem('logicals.players.v1', JSON.stringify({
        players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
      }));
      localStorage.setItem('logicals.solvedSeeds.v1.1', JSON.stringify(solved));
    }
  }, [intro, player, SOLVED] as const);

  // GET liefert die Liste, POST einen einzelnen Spieler. Beides mit derselben
  // Form zu beantworten hat im Erstbesuch eine rohe TypeError-Meldung erzeugt,
  // die wie ein App-Fehler aussah und keiner war.
  await page.route('**/api/players**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: route.request().method() === 'POST'
      ? JSON.stringify({ player: { id: 2, displayName: 'Neu', createdAt: '2026-09-20T00:00:00Z' } })
      : JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-17T00:00:00Z' }] }),
  }));
  await page.route('**/api/players/*/results**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      results: [
        {
          id: 2, seed: 4711, difficulty: 'mittel', elapsedMs: 250_000, failedChecks: 1,
          completedAt: '2026-09-19T20:00:00Z', title: 'Beobachtungsnacht in der Sternwarte',
          configurationJson: JSON.stringify({ categoryCount: 4, valuesPerCategory: 4 }),
          duel: { outcome: 'won', opponent: 'Bo', opponentElapsedMs: 265_000, opponentFailedChecks: 2 },
        },
        {
          id: 1, seed: 42, difficulty: 'leicht', elapsedMs: 180_000, failedChecks: 0,
          completedAt: '2026-09-18T19:00:00Z', title: 'Finale beim Street-Food-Festival',
          configurationJson: JSON.stringify({ categoryCount: 3, valuesPerCategory: 4 }),
        },
      ],
    }),
  }));
}

async function toStart(page: Page) {
  await page.goto('/');
  await expect(page.locator('#settings-button')).toBeEnabled({ timeout: 30_000 });
  await page.waitForTimeout(250);
}

async function openPuzzle(page: Page) {
  await page.locator('#start-button').click();
  await page.locator('#field-categoryCount').selectOption('5');
  await page.locator('#field-valuesPerCategory').selectOption('5');
  await page.locator('#field-difficulty').selectOption('leicht');
  await page.locator('#generate-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#overview-canvas')).toBeVisible();
  await page.waitForTimeout(400);
}

const VARIANTEN = [
  { name: '320-hell', w: 320, h: 568, dark: false },
  { name: '320-dunkel', w: 320, h: 568, dark: true },
  { name: '390-hell', w: 390, h: 844, dark: false },
  { name: '390-dunkel', w: 390, h: 844, dark: true },
] as const;

for (const v of VARIANTEN) {
  test(v.name, async ({ page }) => {
    test.setTimeout(240_000);
    const shot = (n: string) => page.screenshot({ path: `shots/${v.name}-${n}.png` });

    await page.emulateMedia({ colorScheme: v.dark ? 'dark' : 'light' });
    await page.setViewportSize({ width: v.w, height: v.h });
    await seed(page);

    await toStart(page);
    await shot('01-start');

    await page.locator('#collection-button').click();
    await page.waitForTimeout(400);
    await shot('02-sammlung');

    await page.locator('.chapter-row').first().click();
    await page.waitForTimeout(400);
    await shot('03-kapitel');

    await toStart(page);
    await page.locator('#history-button').click();
    await page.waitForTimeout(500);
    await shot('04-ergebnisse');
    await page.locator('#history-tab-stats').click();
    await page.waitForTimeout(400);
    await shot('05-statistik');

    await toStart(page);
    await page.locator('#settings-button').click();
    await page.waitForTimeout(350);
    await shot('06-einstellungen');

    await toStart(page);
    await page.locator('#start-button').click();
    await page.waitForTimeout(350);
    await shot('07-neues-raetsel');

    await toStart(page);
    await page.locator('#duel-join-button').click();
    await page.waitForTimeout(350);
    await shot('08-duell-beitreten');

    await toStart(page);
    await openPuzzle(page);
    await shot('09-spiel-gesamt');

    await page.locator('#play-view').click();
    await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
    await page.waitForTimeout(350);
    await shot('10-spiel-einzeln');

    // Drei sichere Zuordnungen in einer Zeile: mindestens zwei sind falsch.
    await page.locator('#overview-mark-yes').click();
    const cells = page.locator('.play-pager .pair-page').first().locator('.cell');
    for (const i of [0, 1, 2]) await cells.nth(i).click();
    await page.locator('#play-check').click();
    await page.waitForTimeout(350);
    await shot('11-pruefen-dialog');
    await page.locator('#confirm-ok').click();
    await page.waitForTimeout(400);
    await shot('12-pruefen-ergebnis');

    // Pause zuerst: die Loesungsansicht weiter unten verdeckt den Blattgriff,
    // und von dort kommt man ohne Neuladen nicht mehr an die Werkzeugleiste.
    await page.locator('#play-pause').click();
    await page.waitForTimeout(400);
    await shot('13-pause');
    await page.locator('#play-pause').click();
    await page.waitForTimeout(400);

    await page.locator('#sheet-toggle').click();          // halb
    await page.waitForTimeout(450);
    await shot('14-hinweise-halb');
    await page.locator('#sheet-toggle').click();          // ganz
    await page.waitForTimeout(450);
    await shot('15-hinweise-ganz');

    await page.locator('#play-solution-button').click();
    await page.waitForTimeout(500);
    await shot('16-loesung');
  });
}

test('querformat', async ({ page }) => {
  test.setTimeout(240_000);
  const shot = (n: string) => page.screenshot({ path: `shots/quer-${n}.png` });
  await page.setViewportSize({ width: 844, height: 390 });
  await seed(page);
  await toStart(page);
  await shot('01-start');
  await openPuzzle(page);
  await shot('02-spiel-gesamt');
  await page.locator('#play-view').click();
  await page.waitForTimeout(350);
  await shot('03-spiel-einzeln');
  await page.locator('#play-check').click();
  await page.waitForTimeout(400);
  await shot('04-pruefen-meldung');
  await page.locator('#sheet-toggle').click();
  await page.waitForTimeout(450);
  await shot('05-hinweise');
});

test('erstbesuch', async ({ page }) => {
  test.setTimeout(240_000);
  const shot = (n: string) => page.screenshot({ path: `shots/erst-${n}.png` });
  await page.setViewportSize({ width: 320, height: 568 });
  await seed(page, { intro: false, player: false });
  await page.goto('/');
  await page.waitForTimeout(800);
  await shot('01-spieler-dialog');

  await page.locator('#player-name').fill('Ada');
  await page.locator('#player-dialog button[type="submit"]').click();
  await page.waitForTimeout(600);
  await shot('02-start-leer');
});

/* Spieler da, Einfuehrung noch nicht gesehen - der zweite Teil des Erstbesuchs. */
test('einfuehrung', async ({ page }) => {
  test.setTimeout(240_000);
  const shot = (n: string) => page.screenshot({ path: `shots/erst-${n}.png` });
  await page.setViewportSize({ width: 320, height: 568 });
  await seed(page, { intro: false });
  await page.goto('/');
  await expect(page.locator('#daily-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#daily-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
  await page.waitForTimeout(500);
  await shot('03-einfuehrung');
});
