/*
 * Aufnahmestrecke fuer den Duell-Ablauf. Laeuft nur mit SHOTS=1.
 *
 * Braucht zwei Browser-Zusammenhaenge und die Duell-Attrappe - deshalb eine
 * eigene Datei statt eines Eintrags in der Hauptstrecke.
 */
import { expect, test, type Page } from '@playwright/test';
import { createDuelState, installDuelApi, ROOM_CODE } from './support/duelServer';

test.skip(!process.env.SHOTS, 'Aufnahmestrecke - mit SHOTS=1 starten');

const solve = async (page: Page) => {
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
};

test('duell-abschluss', async ({ browser }) => {
  test.setTimeout(240_000);
  const state = createDuelState();

  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await installDuelApi(host, { playerId: 1, displayName: 'Ada', state });
  await installDuelApi(guest, { playerId: 2, displayName: 'Bea', state });

  await host.goto('/');
  await host.locator('#duel-join-button').click();
  await host.locator('#duel-source-custom').click();
  await host.locator('#field-categoryCount').selectOption('3');
  await host.locator('#field-valuesPerCategory').selectOption('4');
  await host.locator('#field-difficulty').selectOption('leicht');
  await expect(host.locator('#generate-button')).toHaveText('Duell starten');
  await host.locator('#generate-button').click();
  await expect(host.locator('#duel-room-code')).toHaveText(ROOM_CODE, { timeout: 120_000 });
  await host.screenshot({ path: 'shots/duell-01-lobby-host.png' });

  await guest.goto(`/?room=${ROOM_CODE}`);
  await expect(guest.locator('#screen-duel-entry')).toHaveClass(/is-active/);
  await guest.locator('#duel-entry-submit').click();
  await expect(guest.locator('#duel-room-code')).toHaveText(ROOM_CODE, { timeout: 30_000 });
  await expect(host.locator('.duel-member')).toHaveCount(2, { timeout: 10_000 });
  await guest.screenshot({ path: 'shots/duell-02-lobby-gast.png' });

  await host.locator('#duel-ready').click();
  await guest.locator('#duel-ready').click();
  await expect(host.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(guest.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 30_000 });

  // Der Gastgeber loest zuerst: das ist der Zustand, der den Gast betrifft.
  await solve(host);
  await expect(host.locator('#screen-duel-result')).toHaveClass(/is-active/, { timeout: 30_000 });
  await host.waitForTimeout(600);
  await host.screenshot({ path: 'shots/duell-03-fertig-wartet.png' });
  /*
   * Und was der Gast in genau diesem Moment sieht. Vorher: nichts. Jetzt
   * meldet der Poller den fertigen Gegner - er laeuft alle fuenf Sekunden,
   * deshalb hier ausdruecklich darauf warten statt blind zu pausieren.
   */
  await expect(guest.locator('#opponent-dialog')).toBeVisible({ timeout: 40_000 });
  await guest.screenshot({ path: 'shots/duell-04-gast-spielt-noch.png' });

  await solve(guest);
  await expect(guest.locator('#duel-result-list .duel-result-card')).toHaveCount(2, { timeout: 30_000 });
  await guest.waitForTimeout(600);
  await guest.screenshot({ path: 'shots/duell-05-beide-fertig.png' });

  await hostContext.close();
  await guestContext.close();
});

/*
 * Der zweite Ausgang: der Gegner gibt auf.
 *
 * Eigene Strecke, weil der Ablauf sich ab dem Gegner-Dialog trennt - dort
 * loest der eine weiter, hier steigt er aus. Was der Sieger dann sieht, war
 * bis eben ein ewiger Wartehinweis.
 */
test('duell-aufgabe', async ({ browser }) => {
  test.setTimeout(240_000);
  const state = createDuelState();

  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await installDuelApi(host, { playerId: 1, displayName: 'Ada', state });
  await installDuelApi(guest, { playerId: 2, displayName: 'Bea', state });

  await host.goto('/');
  await host.locator('#duel-join-button').click();
  await host.locator('#duel-source-custom').click();
  await host.locator('#field-categoryCount').selectOption('3');
  await host.locator('#field-valuesPerCategory').selectOption('4');
  await host.locator('#field-difficulty').selectOption('leicht');
  await expect(host.locator('#generate-button')).toHaveText('Duell starten');
  await host.locator('#generate-button').click();
  await expect(host.locator('#duel-room-code')).toHaveText(ROOM_CODE, { timeout: 120_000 });

  await guest.goto(`/?room=${ROOM_CODE}`);
  await expect(guest.locator('#screen-duel-entry')).toHaveClass(/is-active/);
  await guest.locator('#duel-entry-submit').click();
  await expect(guest.locator('#duel-room-code')).toHaveText(ROOM_CODE, { timeout: 30_000 });
  await host.locator('#duel-ready').click();
  await guest.locator('#duel-ready').click();
  await expect(host.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(guest.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 30_000 });

  await solve(host);
  await expect(host.locator('#screen-duel-result')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(guest.locator('#opponent-dialog')).toBeVisible({ timeout: 40_000 });
  // Ein paar Felder, damit die Kachel drueben einen Stand zu zeigen hat.
  await guest.locator('.play-pager .cell').evaluateAll(cells => {
    for (const cell of cells.slice(0, 7)) (cell as HTMLButtonElement).click();
  });
  await guest.locator('#opponent-later').click();
  await expect(guest.locator('#screen-start')).toHaveClass(/is-active/);
  await guest.waitForTimeout(400);
  await guest.screenshot({ path: 'shots/duell-06-aufgeber-start.png' });

  await expect(host.locator('#duel-result-hint'))
    .toHaveText('Das Duell ist beendet.', { timeout: 30_000 });
  await host.waitForTimeout(600);
  await host.screenshot({ path: 'shots/duell-07-sieger-nach-aufgabe.png' });

  await hostContext.close();
  await guestContext.close();
});
