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
  // Ein Spieler, der schon einmal hier war, hat die Einfuehrung gesehen.
  // Sie gehoert in first-run.spec.ts und nirgendwo sonst.
  await page.addInitScript(() => localStorage.setItem('logicals.seenIntro.v1', '1'));
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

/** Writes preferences before the app boots, the way a returning player has them. */
async function withPrefs(page: Page, prefs: Record<string, boolean>) {
  await page.addInitScript(value => localStorage.setItem('logicals.prefs.v1', JSON.stringify(value)),
    { autoCross: true, hideClock: false, hideDuel: false, ...prefs });
}

test('hiding the clock keeps recording the time', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await withPrefs(page, { hideClock: true });
  await page.goto('/');
  await page.locator('#daily-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });

  await expect(page.locator('#play-timer')).toBeHidden();
  // Still running underneath: a hidden clock must not cost the result its time.
  await page.waitForTimeout(1600);
  expect(await page.locator('#play-timer').textContent()).not.toBe('0:00');
});

test('hiding the duel removes every way into one', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await withPrefs(page, { hideDuel: true });
  await page.goto('/');
  await expect(page.locator('#duel-join-button')).toBeHidden();

  /*
   * Und nicht nur der Knopf zur Lobby - auch der Weg, eines anzufangen.
   * Der lag frueher als zweiter Knopf im Konfigurator; inzwischen hat das
   * Duell einen eigenen Bildschirm, und der haengt allein an dem Knopf, der
   * hier gerade verborgen ist. Der Konfigurator traegt nur noch "Spielen".
   */
  await page.locator('#start-button').click();
  await expect(page.locator('#generate-button')).toHaveText('Spielen');
  await expect(page.getByRole('button', { name: /Duell/ })).toHaveCount(0);
});

test('the settings screen offers nothing that does not affect playing', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await page.locator('#start-button').click();

  for (const gone of ['#field-puzzleCount', '#field-title', '#field-subtitle',
                      '#field-palette', '#field-accent', '#field-secondary', '#field-ink']) {
    await expect(page.locator(gone)).toHaveCount(0);
  }
  // One puzzle is generated, and it is the one that gets played - straight
  // away now, with no booklet in between.
  await page.locator('#generate-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
});

const STATS_HISTORY: Result[] = [
  {
    id: 4, playerId: 1, roomId: 1, attemptKey: 'd', puzzleFingerprint: 'f',
    puzzleTitle: 'Duell', themeId: 'standard', difficulty: 'mittel', seed: 99,
    configuration: { categoryCount: 5, valuesPerCategory: 5 },
    elapsedMs: 60_000, failedChecks: 1, completedAt: '2026-09-18T12:00:00.000Z',
    opponentName: 'Bo', opponentElapsedMs: 75_000, opponentFailedChecks: 3,
  },
  {
    id: 3, playerId: 1, roomId: null, attemptKey: 'c', puzzleFingerprint: 'f',
    puzzleTitle: 'Solo', themeId: 'standard', difficulty: 'leicht', seed: 98,
    configuration: { categoryCount: 5, valuesPerCategory: 5 },
    elapsedMs: 240_000, failedChecks: 0, completedAt: '2026-09-17T12:00:00.000Z',
    opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
  },
  {
    id: 2, playerId: 1, roomId: null, attemptKey: 'b', puzzleFingerprint: 'f',
    puzzleTitle: 'Solo', themeId: 'standard', difficulty: 'leicht', seed: 97,
    configuration: { categoryCount: 5, valuesPerCategory: 5 },
    elapsedMs: 260_000, failedChecks: 4, completedAt: '2026-09-16T12:00:00.000Z',
    opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
  },
];

test('the statistics screen reports development and the head-to-head', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page, STATS_HISTORY);
  await page.goto('/');
  // Die Statistik ist ein Reiter der Ergebnisse, kein eigener Bildschirm mehr.
  await page.locator('#history-button').click();
  await page.locator('#history-tab-stats').click();

  const body = page.locator('#stats-body');
  // The median of 240s and 260s - a mean of all three would say something else.
  await expect(body).toContainText('4:10');
  await expect(body).toContainText('2 gelöst');
  await expect(body).toContainText('Fehlprüfungen');
  await expect(body).toContainText('Serie');

  /*
   * Head-to-head steht NICHT mehr hier: es lag unter derselben Ueberschrift
   * wie die eigenen Zahlen, also musste man erst durch die eigene Statistik
   * scrollen, um zu sehen, wie ein Duell ausgegangen ist.
   */
  await expect(body).not.toContainText('Gegen Bo');

  /*
   * Und die Zeile sagt, WOMIT gerechnet wurde.
   *
   * Hier steht "letzten 100", weil dieser Test die ungedeckelte Abfrage nicht
   * bedient - die Statistik faellt dann auf die Ergebnisliste zurueck. Eine
   * feste Zeile "ueber alle" waere in genau diesem Fall gelogen, und der
   * Rueckfall ist kein Sonderfall, sondern der Zustand ohne Netz.
   */
  await expect(page.locator('.stats-scope')).toContainText('letzten 100');
});

test('der Kopf zeigt Stufe, Fortschritt und was noch fehlt', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page, STATS_HISTORY);
  await page.route('**/api/players/*/experience', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ xp: 812, solved: 21 }),
  }));
  await page.goto('/');
  await page.locator('#history-button').click();

  // 812 liegt in Stufe 7 (ab 800), die naechste beginnt bei 1100.
  await expect(page.locator('#profile-level')).toHaveText('7');
  await expect(page.locator('#profile-gap')).toHaveText('Noch 288 Erfahrung bis Stufe 8');
  await expect(page.locator('#history-player')).toHaveText('Ada');

  /*
   * Der Ring zeigt denselben Anteil, den die Zeile nennt: 12 von 300 in der
   * Stufe, also 4 Prozent bemalt und 96 Prozent Versatz. Geprueft wird der
   * Versatz, weil genau er falsch herum sein kann - voll heisst 0, nicht der
   * ganze Umfang.
   */
  const versatz = await page.locator('#profile-fill')
    .evaluate(node => parseFloat((node as SVGElement).style.strokeDashoffset));
  const umfang = 2 * Math.PI * 52;
  expect(versatz).toBeGreaterThan(umfang * 0.9);
  expect(versatz).toBeLessThan(umfang);

  // Und die Zahl steht nur einmal auf dem Schirm, nicht auch in der Tabelle.
  await page.locator('#history-tab-stats').click();
  await expect(page.locator('#stats-body')).not.toContainText('Erfahrung');
});

test('ohne Erfahrungsstand bleibt nur der Name stehen', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page, STATS_HISTORY);
  // Kein Netz fuer die Erfahrung, und kein gemerkter Stand.
  await page.route('**/api/players/*/experience', route => route.abort());
  await page.goto('/');
  await page.locator('#history-button').click();

  // Lieber nichts als eine falsche Zahl - dieselbe Regel wie im Geloest-Dialog.
  await expect(page.locator('#profile-ring')).toBeHidden();
  await expect(page.locator('#profile-gap')).toBeEmpty();
  await expect(page.locator('#history-player')).toHaveText('Ada');
});

test('mit der vollständigen Historie rechnet die Statistik über alles', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page, STATS_HISTORY);
  // Dieselben Zeilen, aber über die ungedeckelte Abfrage geliefert.
  await page.route('**/api/players/*/history', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ results: STATS_HISTORY }),
  }));
  await page.goto('/');
  await page.locator('#history-button').click();
  await page.locator('#history-tab-stats').click();

  await expect(page.locator('#stats-body')).toContainText('Deine Entwicklung');
  await expect(page.locator('.stats-scope')).toContainText('Über alle');
});

test('an empty history says so instead of showing zeroes', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page, []);
  await page.goto('/');
  await page.locator('#history-button').click();
  // Ein Hinweis fuer beide Reiter: die Quelle ist dieselbe, also ist auch das
  // "es gibt noch nichts" dasselbe und muss nicht zweimal dastehen.
  await expect(page.locator('#history-hint')).toContainText('Noch keine');
  await page.locator('#history-tab-stats').click();
  await expect(page.locator('#stats-body')).toBeEmpty();
});

/*
 * Ergebnisse und Statistik sind ein Bildschirm.
 *
 * Sie standen als zwei Knoepfe direkt untereinander, lasen dieselbe Quelle und
 * widersprachen sich dabei im Umfang: die Raetselliste fragte 50 Eintraege ab,
 * die Statistik 100. Zwei benachbarte Knoepfe gaben verschiedene Antworten auf
 * "meine Ergebnisse", und nichts sagte, worin sie sich unterscheiden sollen.
 */
test('Ergebnisse und Statistik teilen einen Bildschirm und eine Abfrage', async ({ page }) => {
  await withPlayer(page);
  // Nach withPlayer registriert, damit diese Route gewinnt - Playwright nimmt
  // die zuletzt eingetragene zuerst.
  let calls = 0;
  await page.route('**/api/players/*/results**', route => {
    calls += 1;
    expect(new URL(route.request().url()).searchParams.get('limit'),
      'beide Reiter lesen denselben Umfang').toBe('100');
    return route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ results: STATS_HISTORY }),
    });
  });
  await page.goto('/');
  await expect(page.locator('#stats-button')).toHaveCount(0);

  await page.locator('#history-button').click();
  await expect(page.locator('#screen-history')).toHaveClass(/is-active/);
  await expect(page.locator('#history-panel-list')).toBeVisible();
  await expect(page.locator('#history-panel-stats')).toBeHidden();

  const before = calls;
  await page.locator('#history-tab-stats').click();
  await expect(page.locator('#history-panel-stats')).toBeVisible();
  await expect(page.locator('#history-panel-list')).toBeHidden();
  await expect(page.locator('#stats-body')).toContainText('Deine Entwicklung');
  expect(calls, 'der Reiterwechsel darf nicht neu laden').toBe(before);
});

/*
 * Duelle sind ein eigener Ort, keine Fussnote unter der eigenen Statistik.
 *
 * Geprueft bei 320px, dem engsten Geraet: drei Reiter teilen sich dort die
 * Breite gleichmaessig (segmented--even), und "Statistik" ist das laengste
 * Wort. Bricht es um, waere die Leiste zweizeilig und die Gleichverteilung
 * das Erste, was jemand opfern wuerde - deshalb hier festgehalten.
 */
test('Duelle haben einen eigenen Reiter', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await withPlayer(page, STATS_HISTORY);
  await page.goto('/');
  await page.locator('#history-button').click();
  await page.locator('#history-tab-duels').click();

  const duels = page.locator('#duels-body');
  await expect(duels).toContainText('Gegen Bo');
  /*
   * Beschriftete Zeilen statt „1 – 0 – 0": das Zahlentripel ist eine
   * Sportkonvention, deren Reihenfolge je nach Sportart wechselt.
   */
  await expect(duels).toContainText('Gewonnen');
  await expect(duels).toContainText('Unentschieden');
  await expect(duels).toContainText('0:15');            // 15s Vorsprung
  await expect(duels).toContainText('du bist schneller');
  // Und der Symbolstreifen hat eine Bildzeile - ein einzelner Punkt in einer
  // leeren Zeile las sich wie ein haengengebliebener Aufzaehlungspunkt.
  await expect(duels).toContainText('Letzte Duelle, neueste zuerst');

  // Die Reiterleiste bleibt einzeilig, und kein Reiter faellt unter die
  // Tapgroesse.
  const leiste = page.locator('#screen-history .segmented[role="tablist"]');
  const hoehen = await page.locator('#screen-history .segmented__item').evaluateAll(nodes =>
    nodes.map(node => node.getBoundingClientRect().height));
  const leisteHoehe = (await leiste.boundingBox())!.height;
  expect(Math.max(...hoehen), 'ein Reiter ist hoeher als die Leiste - er bricht um')
    .toBeLessThanOrEqual(leisteHoehe + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth))
    .toBe(false);

  // Und die drei Reiter teilen sich die Breite wirklich zu gleichen Teilen.
  const breiten = await page.locator('#screen-history .segmented__item').evaluateAll(nodes =>
    nodes.map(node => node.getBoundingClientRect().width));
  expect(breiten).toHaveLength(3);
  expect(Math.max(...breiten) - Math.min(...breiten)).toBeLessThan(1.5);
});

test('ohne Duelle bleibt der Reiter nicht leer', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 320, height: 568 });
  // Nur Einzelspiel-Ergebnisse: ein leerer Bereich laese sich wie ein Fehler.
  await withPlayer(page, STATS_HISTORY.filter(result => !result.opponentName));
  await page.goto('/');
  await page.locator('#history-button').click();
  await page.locator('#history-tab-duels').click();
  await expect(page.locator('#duels-body')).toContainText('Noch keine Duelle');
});
