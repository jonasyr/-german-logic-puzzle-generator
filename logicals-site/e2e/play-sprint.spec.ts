import { expect, test, type Page } from '@playwright/test';
import { CELL_SELECTORS, findVeiledCells } from './support/layoutGuard';

async function withPlayer(page: Page) {
  await page.addInitScript(() => Object.defineProperty(navigator, 'maxTouchPoints', { get: () => 5 }));
  await page.route('**/api/players', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-18T00:00:00Z' }] }),
  }));
  // Ein Spieler, der schon einmal hier war, hat die Einfuehrung gesehen.
  // Sie gehoert in first-run.spec.ts und nirgendwo sonst.
  await page.addInitScript(() => localStorage.setItem('logicals.seenIntro.v1', '1'));
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
}

async function generateAndPlay(page: Page) {
  await page.locator('#start-button').click();
  await page.locator('#field-categoryCount').selectOption('5');
  await page.locator('#field-valuesPerCategory').selectOption('5');
  await page.locator('#field-difficulty').selectOption('leicht');
  await page.locator('#generate-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#overview-canvas')).toBeVisible();
  await page.waitForTimeout(350);
}

/** Taps a mirror cell by index, which drives the real hit path. */
async function tapCell(page: Page, index: number) {
  const cell = page.locator('.overview-mirror__cell').nth(index);
  const box = (await cell.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  return cell.getAttribute('data-key');
}

test('a game in progress can be resumed after a reload', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  const title = await page.locator('#play-title').textContent();
  const key = await tapCell(page, 0);
  await tapCell(page, 1);
  await page.waitForTimeout(200);

  await page.reload();
  const resume = page.locator('#resume-button');
  await expect(resume).toBeVisible();
  await expect(page.locator('#resume-detail')).toContainText('Markierungen');

  await resume.click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
  // The same puzzle, and the same marks on it.
  await expect(page.locator('#play-title')).toHaveText(title || '');
  const label = await page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(label).toContain('ausgeschlossen');
});

test('an empty grid offers nothing to resume', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.reload();
  await expect(page.locator('#resume-button')).toBeHidden();
});

test('a record that cannot be rebuilt is refused and cleared', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);
  await tapCell(page, 0);
  await page.waitForTimeout(200);

  await page.reload();
  await expect(page.locator('#resume-button')).toBeVisible();

  // Corrupt the fingerprint AFTER the reload. Doing it before is pointless: the
  // page's own pagehide handler persists the live game on the way out and would
  // simply write the correct fingerprint back over it.
  await page.evaluate(() => {
    const record = JSON.parse(localStorage.getItem('logicals.resume.v1')!);
    record.fingerprint = 'not-the-right-fingerprint';
    localStorage.setItem('logicals.resume.v1', JSON.stringify(record));
  });

  await page.locator('#resume-button').click();
  await expect(page.locator('#start-hint')).toContainText('identisch erzeugen', { timeout: 60_000 });
  // And it does not stay around to fail again.
  await expect(page.locator('#resume-button')).toBeHidden();
});

test('a solved puzzle is not offered for resuming', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);
  await tapCell(page, 0);
  await page.waitForTimeout(200);
  await expect(page.locator('#play-undo')).toBeEnabled();

  // Emptying the grid is the same signal as solving it: there is nothing to
  // come back to.
  await page.locator('#play-clear').click();
  await page.locator('#confirm-ok').click();
  await page.waitForTimeout(200);

  await page.reload();
  await expect(page.locator('#resume-button')).toBeHidden();
});

test('a note can be placed and cleared, and survives a reload', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.locator('#overview-mark-maybe').click();
  const key = await tapCell(page, 0);
  const label = () => page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(await label()).toContain('vermutet');

  await page.reload();
  await page.locator('#resume-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 60_000 });
  expect(await label()).toContain('vermutet');

  // Armed on what the cell already holds, the same tool takes it back off.
  await page.locator('#overview-mark-maybe').click();
  await tapCell(page, 0);
  expect(await label()).toContain('leer');
});

test('the pager marks with the same tool as the overview', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.locator('#overview-mark-maybe').click();
  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');

  const cell = page.locator('.play-pager .cell').first();
  const key = await cell.getAttribute('data-key');
  await cell.click();
  // The pager used to cycle to a cross here regardless of the armed tool.
  await expect(cell).toHaveText('·');

  await page.locator('#play-view').click();
  const label = await page.locator(`.overview-mirror__cell[data-key="${key}"]`).getAttribute('aria-label');
  expect(label).toContain('vermutet');
});

test('a note is never reported as a wrong mark', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.locator('#overview-mark-maybe').click();
  for (const index of [0, 1, 2, 3]) await tapCell(page, index);

  await page.locator('#play-check').click();
  await page.locator('#confirm-ok').click();
  // Notes are uncertainty, not claims: checking cannot find fault with them.
  await expect(page.locator('#play-status')).not.toContainText('stimmt nicht');
  await expect(page.locator('#play-status')).not.toContainText('stimmen nicht');
});

test('solving a puzzle is acknowledged, with a way back to the start', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.route('**/api/results', route => route.fulfill({
    status: 201, contentType: 'application/json', body: '{"result":{}}',
  }));
  await page.goto('/');
  await generateAndPlay(page);

  // Solve it from the solution table, the way the duel spec does.
  await page.locator('#play-solution-button').evaluate((button: HTMLButtonElement) => button.click());
  await page.locator('#confirm-ok').click();
  const labels = await page.locator('#play-solution-table').evaluate(container => {
    const headers = [...container.querySelectorAll('th')].map(cell => cell.textContent || '');
    return [...container.querySelectorAll('tbody tr')].flatMap(row => {
      const values = [...row.querySelectorAll('td')].map(cell => cell.textContent || '');
      return headers.flatMap((_, left) => headers.slice(left + 1).map((__, offset) =>
        `${values[left]} / ${values[left + offset + 1]}`));
    });
  });
  await page.locator('#overview-mark-yes').evaluate((button: HTMLButtonElement) => button.click());
  await page.locator('.play-pager .cell').evaluateAll((cells, wanted) => {
    for (const label of wanted as string[]) {
      const cell = cells.find(c => (c as HTMLElement).dataset.label === label) as HTMLButtonElement;
      cell.click();
    }
  }, labels);

  const solved = page.locator('#solved-dialog');
  await expect(solved).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('#solved-title')).toHaveText('Geschafft!');
  await expect(page.locator('#solved-puzzle')).not.toBeEmpty();
  // The numbers worth keeping, not just a cheer.
  await expect(page.locator('#solved-time')).toHaveText(/^\d+:\d{2}$/);
  await expect(page.locator('#solved-checks')).toHaveText(/^\d+$/);
  await expect(page.locator('#solved-marks')).toHaveText(/^\d+$/);

  await page.locator('#solved-home').click();
  await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
  // A solved puzzle is not something to come back to.
  await expect(page.locator('#resume-button')).toBeHidden();
});

/** One duel row, one solo row, and one duel the opponent has not finished. */
const HISTORY = [
  {
    id: 3, playerId: 1, roomId: null, attemptKey: 'c', puzzleFingerprint: 'f',
    puzzleTitle: 'Allein im Museum', themeId: 'museum', difficulty: 'leicht',
    seed: 4711, configuration: {}, elapsedMs: 50_000, failedChecks: 0,
    completedAt: '2026-09-18T02:00:00Z',
    opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
  },
  {
    id: 2, playerId: 1, roomId: 5, attemptKey: 'b', puzzleFingerprint: 'f',
    puzzleTitle: 'Duell gewonnen', themeId: 'museum', difficulty: 'mittel',
    seed: 41, configuration: {}, elapsedMs: 61_000, failedChecks: 2,
    completedAt: '2026-09-18T01:00:00Z',
    opponentName: 'Bo', opponentElapsedMs: 75_000, opponentFailedChecks: 4,
  },
  {
    id: 1, playerId: 1, roomId: 9, attemptKey: 'a', puzzleFingerprint: 'f',
    puzzleTitle: 'Duell offen', themeId: 'museum', difficulty: 'schwer',
    seed: 7, configuration: {}, elapsedMs: 90_000, failedChecks: 1,
    completedAt: '2026-09-18T00:00:00Z',
    opponentName: null, opponentElapsedMs: null, opponentFailedChecks: null,
  },
];

test('the results list settles each duel and leaves solo rows alone', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.route('**/api/players/1/results*', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: HISTORY }),
  }));
  await page.goto('/');
  await page.locator('#history-button').click();

  const cards = page.locator('.history-card');
  await expect(cards).toHaveCount(3);

  // A solo result says nothing about a duel.
  const solo = cards.filter({ hasText: 'Allein im Museum' });
  await expect(solo.locator('.history-card__duel')).toHaveCount(0);

  // A finished duel says who won, against whom, and by how much.
  const won = cards.filter({ hasText: 'Duell gewonnen' }).locator('.history-card__duel');
  await expect(won).toContainText('Duell gewonnen');
  await expect(won).toContainText('gegen Bo');
  await expect(won).toContainText('1:15');          // the opponent's time
  await expect(won).toContainText('0:14 Unterschied');
  await expect(won).toHaveClass(/is-gewonnen/);

  // A duel the other side has not finished says so rather than showing a blank.
  const open = cards.filter({ hasText: 'Duell offen' }).locator('.history-card__duel');
  await expect(open).toContainText('das andere Ergebnis fehlt noch');
  await expect(open).toHaveClass(/is-pending/);
});

/** Plants a duel session for player 1 and answers the room API with `state`. */
async function withStaleDuel(page: Page, state: string) {
  await page.route('**/api/rooms/**', route => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      room: {
        id: 5, code: 'ABC234', state, serverNow: Date.now(), startsAt: null,
        expiresAt: Date.now() + 86_400_000, configuration: {}, bookletSeed: 41,
        puzzleIndex: 0, puzzleFingerprint: 'mismatch', puzzleTitle: 'Museum',
        puzzleThemeId: 'museum', effectivePuzzleSeed: 41,
        members: [{ playerId: 1, displayName: 'Ada', role: 'host', loaded: true, ready: true }],
        results: [],
      },
    }),
  }));
  await page.addInitScript(() => {
    const session = {
      code: 'ABC234', memberToken: 't',
      player: { id: 1, displayName: 'Ada' },
      options: {},
      puzzle: { categories: [], clues: [], targetQuestion: '', solutionRows: [] },
    };
    localStorage.setItem('logicals.duel.v1:ABC234:1', JSON.stringify(session));
    localStorage.setItem('logicals.duel.active.v1:1', 'ABC234');
  });
}

for (const state of ['expired', 'complete', 'waiting']) {
  test(`a reload with a stale ${state} duel still lands on the start screen`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 375, height: 812 });
    await withPlayer(page);
    await withStaleDuel(page, state);

    await page.goto('/');
    await page.waitForTimeout(1200);

    // Nobody asked for a room: reloading the app must not drag you onto the duel
    // screens, whatever the stored session turns out to be.
    await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
    await expect(page.locator('#screen-duel-entry')).not.toHaveClass(/is-active/);
    await expect(page.locator('#screen-duel-result')).not.toHaveClass(/is-active/);

    // And it does not come back on the next reload either.
    await page.reload();
    await page.waitForTimeout(1200);
    await expect(page.locator('#screen-start')).toHaveClass(/is-active/);
  });
}

test('a room link still opens the duel, which is what it is for', async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await withStaleDuel(page, 'expired');

  await page.goto('/?room=ABC234');
  await page.waitForTimeout(1200);
  // Arriving on a link is a deliberate request for that room, so the error
  // belongs on screen rather than being swallowed.
  await expect(page.locator('#screen-duel-entry')).toHaveClass(/is-active/);
  await expect(page.locator('#duel-entry-hint')).not.toBeEmpty();
});

/*
 * „Prüfen" zeigt eine Stelle, nicht alle.
 *
 * Vorher wurde jede falsche Markierung auf einmal rot - wer fünf rote Felder
 * sieht, bekommt die halbe Lösung geschenkt, und genau davor warnte der
 * Bestätigungsdialog. Eine Stelle sagt „hier ist es gekippt", und das ist das,
 * was man wissen will.
 *
 * Dass es die FRÜHESTE ist, ist der eigentliche Gehalt: irgendeine zu zeigen
 * wäre beliebig, die erste ist der Punkt, ab dem alles Weitere darauf aufbaut.
 */
test('Pruefen hebt nur den ersten falschen Schluss hervor', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 375, height: 812 });
  await withPlayer(page);
  await page.goto('/');
  await generateAndPlay(page);

  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
  await page.locator('#overview-mark-yes').click();

  // Drei sichere Zuordnungen in derselben Zeile: höchstens eine kann stimmen,
  // also sind mindestens zwei falsch - ohne die Lösung zu kennen.
  const cells = page.locator('.play-pager .pair-page').first().locator('.cell');
  const keys: string[] = [];
  for (const index of [0, 1, 2]) {
    const cell = cells.nth(index);
    keys.push((await cell.getAttribute('data-key'))!);
    await cell.click();
  }

  await page.locator('#play-check').click();
  await page.locator('#confirm-ok').click();

  const status = await page.locator('#play-status').textContent();
  expect(status, 'die Gesamtzahl bleibt sichtbar').toMatch(/[2-9] Markierungen stimmen nicht/);
  expect(status).toContain('die erste ist hervorgehoben');
  // Kurz halten. Die Meldung steht jetzt zwar im Fluss statt ueber dem Gitter,
  // aber jede Zeile, die sie waechst, nimmt die Buehne dem Gitter weg.
  expect(status!.length, 'die Meldung kostet Buehnenhoehe und muss kurz sein')
    .toBeLessThan(70);

  // Genau eine Stelle, und zwar die zuerst getippte.
  await expect(page.locator('.play-pager .cell.is-wrong')).toHaveCount(1);
  await expect(page.locator(`.play-pager .cell[data-key="${keys[0]}"]`)).toHaveClass(/is-wrong/);

  /*
   * Und die Stelle muss sichtbar sein.
   *
   * Das ist der Punkt, an dem die Meldung einmal versagt hat: sie lag als
   * Overlay auf der Zeile, deren Markierung sie hervorhob. Weil sie Tipps
   * durchliess, blieb der Verdeckungs-Waechter gruen - eine Meldung, die auf
   * eine unsichtbare Zelle zeigt, ist schlimmer als gar keine.
   *
   * Bewusst bei 320x568 geprueft, der engsten Ansicht: dort war der Schaden am
   * groessten, und dort faellt ein Rueckfall zuerst auf.
   */
  await page.setViewportSize({ width: 320, height: 568 });
  const veiled = await findVeiledCells(page, CELL_SELECTORS.pager);
  expect(veiled, `verhuellte Zellen: ${JSON.stringify(veiled)}`).toEqual([]);
});
