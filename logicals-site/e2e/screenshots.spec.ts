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

/*
 * Ein angefangener Stand, damit die Aufnahmen zeigen, was die Sammlung kann.
 *
 * Der Schluessel muss `storageKeyFor` spiegeln, sonst liest ihn niemand:
 * logicals:play:<modus>:<raum>:<spieler>:<thema>:<seed>:<masze>:<hinweise>.
 * Seed 1000003 ist Eintrag 3 des ersten Kapitels, ein 4x4 - also
 * 4 * C(4,2) = 24 sichere Zuordnungen, davon hier neun gesetzt.
 */
const STARTED_KEY = 'logicals:play:solo:none:1:streetfood:1000003:4x4:aufnahme';
const STARTED_VALUE = JSON.stringify({
  marks: Array.from({ length: 9 }, (_, index) => [`0.1.${index}.0`, 'yes']),
  auto: [], usedClues: [], elapsedMs: 184_000, solved: false,
  attemptKey: null, failedChecks: 0, resultQueued: false,
  options: { puzzleCount: 1, categoryCount: 4, valuesPerCategory: 4, seed: 1000003 },
  puzzleIndex: 0, fingerprint: 'aufnahme',
  // Dieselbe Form, die playCatalogueEntry schreibt: die Nummer hinten, damit
  // ein fuehrendes "3." nicht wie ein Fortschritt gelesen wird.
  title: 'Finale beim Street-Food-Festival · Nr. 3',
  savedAt: '2026-09-22T09:00:00.000Z',
});

async function seed(page: Page, opts: { intro?: boolean; player?: boolean } = {}) {
  const { intro = true, player = true } = opts;
  await page.addInitScript(([seenIntro, hasPlayer, solved, startedKey, startedValue]) => {
    if (seenIntro) localStorage.setItem('logicals.seenIntro.v1', '1');
    if (hasPlayer) {
      localStorage.setItem('logicals.players.v1', JSON.stringify({
        players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
      }));
      localStorage.setItem('logicals.solvedSeeds.v1.1', JSON.stringify(solved));
      localStorage.setItem(startedKey, startedValue);
    }
  }, [intro, player, SOLVED, STARTED_KEY, STARTED_VALUE] as const);

  // GET liefert die Liste, POST einen einzelnen Spieler. Beides mit derselben
  // Form zu beantworten hat im Erstbesuch eine rohe TypeError-Meldung erzeugt,
  // die wie ein App-Fehler aussah und keiner war.
  await page.route('**/api/players**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: route.request().method() === 'POST'
      ? JSON.stringify({ player: { id: 2, displayName: 'Neu', createdAt: '2026-09-20T00:00:00Z' } })
      : JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-17T00:00:00Z' }] }),
  }));
  // Die Statistik rechnet ueber alle Ergebnisse und holt sie hier.
  await page.route('**/api/players/*/history', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));
  await page.route('**/api/players/*/experience', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ xp: 812, solved: 21 }),
  }));
  /*
   * Die Feldnamen muessen publicResult im Worker spiegeln, sonst zeigen die
   * Aufnahmen etwas anderes als die App. Zweimal schon danebengegriffen:
   * `solvedAt` statt `completedAt` liess "Invalid Date" erscheinen, `title`
   * statt `puzzleTitle` liess die Raetselnamen ganz verschwinden - beide Male
   * wurde ein Fehler gemeldet, den es nicht gab.
   */
  await page.route('**/api/players/*/results**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({
      results: [
        /*
         * Die Feldnamen spiegeln publicResult im Worker - flach, nicht
         * verschachtelt, und `configuration` bereits geparst.
         *
         * Vorher stand hier `duel: { opponent: ... }` und `configurationJson`.
         * Beides liest die App nirgends: sie fragt `roomId` und
         * `opponentName`. Die Folge war still - JEDE Aufnahme der Ergebnisse
         * zeigte seit Monaten ein Duell, das keines war, und der Duell-Reiter
         * behauptete "noch keine Duelle", obwohl die Attrappe eines lieferte.
         * Drei Scheinfehler sind in diesem Projekt schon aus falschen
         * Feldnamen entstanden; dieser war der vierte.
         */
        {
          id: 2, seed: 4711, difficulty: 'mittel', elapsedMs: 250_000, failedChecks: 1,
          completedAt: '2026-09-19T20:00:00Z', puzzleTitle: 'Beobachtungsnacht in der Sternwarte',
          configuration: { categoryCount: 4, valuesPerCategory: 4 },
          roomId: 7, opponentName: 'Bo', opponentElapsedMs: 265_000, opponentFailedChecks: 2,
        },
        {
          id: 1, seed: 42, difficulty: 'leicht', elapsedMs: 180_000, failedChecks: 0,
          completedAt: '2026-09-18T19:00:00Z', puzzleTitle: 'Finale beim Street-Food-Festival',
          configuration: { categoryCount: 3, valuesPerCategory: 4 },
          roomId: null, opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
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
    await page.waitForTimeout(600);
    await shot('04-ergebnisse');
    await page.locator('#history-tab-stats').click();
    await page.waitForTimeout(400);
    await shot('05-statistik');
    await page.locator('#history-tab-duels').click();
    await page.waitForTimeout(400);
    await shot('05b-duelle');

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
    await shot('08-duell');

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

    // Der Geloest-Dialog mit Erfahrungsblock. Das Raetsel wirklich zu loesen
    // dauert zu lang fuer eine Aufnahmestrecke; gezeigt wird der Zustand.
    await page.evaluate(() => {
      document.getElementById('confirm-dialog')?.removeAttribute('open');
      document.getElementById('solved-puzzle')!.textContent = '1. Finale beim Street-Food-Festival';
      document.getElementById('solved-time')!.textContent = '5:31';
      document.getElementById('solved-checks')!.textContent = '0';
      document.getElementById('solved-marks')!.textContent = '48';
      /*
       * Zahlen, die zusammenpassen.
       *
       * Vorher standen hier "+56", "noch 288" und 4% Fuellung nebeneinander -
       * drei Werte aus drei verschiedenen Zustaenden. Eine Durchsicht hat
       * prompt gerechnet und einen Widerspruch gemeldet, den es in der App
       * nicht gibt. Jetzt ein einziger Stand: 845 Punkte, Stufe 7 reicht von
       * 800 bis 1100, also 45 drin, 255 fehlen, 15% gefuellt.
       */
      document.getElementById('solved-xp-gain')!.textContent = '+45';
      document.getElementById('solved-xp-level')!.textContent = 'Noch 255 Erfahrung bis Stufe 8';
      document.getElementById('solved-xp-fill')!.setAttribute('style', 'width: 15%');
      document.getElementById('solved-xp')!.hidden = false;
      (document.getElementById('solved-dialog') as HTMLDialogElement).showModal();
    });
    await page.waitForTimeout(400);
    // Freies Spiel: kein naechstes Raetsel, also traegt "Zur Startseite" die
    // Hauptrolle - so, wie showSolved die Klassen setzt.
    await page.evaluate(() => {
      const home = document.getElementById('solved-home')!;
      home.classList.add('btn--primary');
      home.classList.remove('btn--ghost');
    });
    await shot('17-geschafft');

    // Und der Sammlungs-Fall: der staerkste Knopf fuehrt weiter, nicht hinaus.
    await page.evaluate(() => {
      const home = document.getElementById('solved-home')!;
      home.classList.remove('btn--primary');
      home.classList.add('btn--ghost');
      document.getElementById('solved-next')!.hidden = false;
    });
    await page.waitForTimeout(200);
    await shot('18-geschafft-sammlung');
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
