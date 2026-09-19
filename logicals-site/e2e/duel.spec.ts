import { expect, test } from '@playwright/test';
import { createDuelState, installDuelApi, ROOM_CODE } from './support/duelServer';

test('two devices load the same runtime puzzle and enter play from one start instant', async ({ browser }) => {
  const state = createDuelState();


  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await installDuelApi(host, { playerId: 1, displayName: 'Ada', state });
  await installDuelApi(guest, { playerId: 2, displayName: 'Bea', state });

  await host.goto('/');
  await host.locator('#start-button').click();
  await host.locator('#field-categoryCount').selectOption('3');
  await host.locator('#field-valuesPerCategory').selectOption('4');
  await host.locator('#field-difficulty').selectOption('leicht');
  // 'Duell starten' erzeugt selbst; ein Druck auf 'Spielen' davor wuerde im
  // Solo-Spiel landen, weil es kein Heft mehr gibt, das beides anboete.
  await host.locator('#duel-start-button').click();
  await expect(host.locator('#duel-room-code')).toHaveText(ROOM_CODE);
  await host.reload();
  await expect(host.locator('#duel-room-code')).toHaveText(ROOM_CODE);

  await guest.goto('/?room=ABC234');
  await expect(guest.locator('#screen-duel-entry')).toHaveClass(/is-active/);
  await guest.locator('#duel-entry-submit').click();
  await expect(guest.locator('#duel-room-code')).toHaveText(ROOM_CODE, { timeout: 30_000 });
  await guest.reload();
  await expect(guest.locator('#duel-room-code')).toHaveText(ROOM_CODE);
  await expect(host.locator('.duel-member')).toHaveCount(2, { timeout: 5_000 });

  await host.locator('#duel-ready').click();
  await guest.locator('#duel-ready').click();
  await expect(host.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 10_000 });
  await expect(guest.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 10_000 });
  await expect(host.locator('#play-title')).toHaveText(await guest.locator('#play-title').textContent() || '');

  /*
   * The play screen must stay built once the duel starts.
   *
   * poll() rescheduled itself unconditionally, but applySnapshot had already
   * ended the lobby by calling startGame. A second later the snapshot still
   * read 'active', startGame ran again, and openPlay rebuilt everything: the
   * grid blinked out and back, the clue sheet closed, any highlight was lost.
   * It hit whoever joined by code hardest, because their very first poll
   * already sees an active room.
   *
   * Node identity is the test: a rebuild detaches the cells it replaces.
   */
  const guestCell = await guest.locator('.overview-mirror__cell').first().elementHandle();
  const hostCellNode = await host.locator('.overview-mirror__cell').first().elementHandle();
  await guest.locator('#sheet-toggle').click();
  await expect(guest.locator('#sheet-toggle')).toHaveAttribute('aria-expanded', 'true');

  // Comfortably longer than the one-second poll that used to restart the game.
  await guest.waitForTimeout(3_500);

  expect(await guestCell!.evaluate(node => node.isConnected),
    'the guest grid was rebuilt underneath the player').toBe(true);
  expect(await hostCellNode!.evaluate(node => node.isConnected),
    'the host grid was rebuilt underneath the player').toBe(true);
  // What the player actually notices: the clue sheet they opened is still open.
  await expect(guest.locator('#sheet-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(guest.locator('#screen-play')).toHaveClass(/is-active/);

  // Marking in one room's overview must not leak into the other room's grid:
  // the puzzle is shared, the progress is not.
  await expect(host.locator('#overview-canvas')).toBeVisible();
  const hostCell = host.locator('.overview-mirror__cell').first();
  const hostKey = await hostCell.getAttribute('data-key');
  const box = (await hostCell.boundingBox())!;
  // The cross tool is armed on open, so the tap marks. Pressing #overview-mark-no
  // here would DISARM it and leave every later tap inert - which is exactly what
  // an earlier version of this test did, silently.
  await expect(host.locator('#overview-mark-no')).toHaveAttribute('aria-pressed', 'true');
  await host.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(host.locator(`.overview-mirror__cell[data-key="${hostKey}"]`))
    .toHaveAttribute('aria-label', /ausgeschlossen/);
  await expect(guest.locator(`.overview-mirror__cell[data-key="${hostKey}"]`))
    .toHaveAttribute('aria-label', /leer/);
  await host.locator('#play-undo').click();
  await expect(host.locator(`.overview-mirror__cell[data-key="${hostKey}"]`))
    .toHaveAttribute('aria-label', /leer/);

  // Progress crosses as a COUNT and nothing else.
  //
  // Asserted as an exact number, not as the phrase: an earlier version of this
  // checked only for 'Felder gesetzt', which a permanently-zero count satisfies
  // too - and the count WAS permanently zero, because nothing was feeding the
  // reporter. A test that a broken feature passes is worse than no test.
  const hostCells = host.locator('.overview-mirror__cell');
  for (const index of [0, 1, 2]) {
    const cellBox = (await hostCells.nth(index).boundingBox())!;
    await host.mouse.click(cellBox.x + cellBox.width / 2, cellBox.y + cellBox.height / 2);
  }
  await expect(guest.locator('#duel-progress')).toHaveText('Gegner: 3 Felder gesetzt', { timeout: 25_000 });

  // It keeps up as the host carries on.
  const fourth = (await hostCells.nth(3).boundingBox())!;
  await host.mouse.click(fourth.x + fourth.width / 2, fourth.y + fourth.height / 2);
  await expect(guest.locator('#duel-progress')).toHaveText('Gegner: 4 Felder gesetzt', { timeout: 25_000 });

  // The guest's own grid is untouched by anything the host did.
  await expect(guest.locator('#play-undo')).toBeDisabled();
  const guestMarked = await guest.locator('.overview-mirror__cell[aria-selected="true"]').count();
  expect(guestMarked).toBe(0);

  // And the host is told nothing about the guest, who has marked nothing.
  await expect(host.locator('#duel-progress')).toHaveText('Gegner: 0 Felder gesetzt', { timeout: 25_000 });

  // A duel is played on the same screen, so it refuses page zoom the same way.
  for (const page of [host, guest]) {
    const prevented = await page.evaluate(() => {
      const event = new Event('gesturestart', { bubbles: true, cancelable: true });
      document.getElementById('play-goal')!.dispatchEvent(event);
      document.getElementById('play-goal')!.dispatchEvent(
        new Event('gestureend', { bubbles: true, cancelable: true }),
      );
      const screen = getComputedStyle(document.getElementById('screen-play')!).touchAction;
      return { prevented: event.defaultPrevented, screen };
    });
    expect(prevented.prevented).toBe(true);
    expect(prevented.screen).not.toContain('pinch-zoom');
  }

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
    // Arm the confirm tool, then one click per cell. This used to click twice to
    // cycle empty -> x -> o; both views share an armed tool now, so a second
    // click would take the mark straight back off again.
    await page.locator('#overview-mark-yes').evaluate((button: HTMLButtonElement) => button.click());
    await page.locator('.play-pager .cell').evaluateAll((cells, wanted) => {
      for (const label of wanted as string[]) {
        const cell = cells.find(candidate => (candidate as HTMLElement).dataset.label === label) as HTMLButtonElement;
        cell.click();
      }
    }, labels);
  };

  await solve(host);
  await expect(host.locator('#screen-duel-result')).toHaveClass(/is-active/);
  await expect(host.locator('#duel-result-list .duel-result-card')).toHaveCount(1);
  await solve(guest);
  await expect(guest.locator('#duel-result-list .duel-result-card')).toHaveCount(2);
  await expect(host.locator('#duel-result-list .duel-result-card')).toHaveCount(2, { timeout: 5_000 });

  await hostContext.close();
  await guestContext.close();
});

/*
 * Ein laufendes Duell wird nicht versehentlich verlassen.
 *
 * Der Zurueck-Knopf des Spiels fuehrte ohne jede Rueckfrage heraus, waehrend
 * "Pruefen" und "Loeschen" - die nur einen Hinweis verraten bzw. die eigenen
 * Markierungen kosten - je einen Bestaetigungsdialog hatten. Die Absicherung
 * war invers zum Risiko.
 */
test('ein laufendes Duell wird nicht ohne Rueckfrage verlassen', async ({ browser }) => {
  test.setTimeout(180_000);
  const state = createDuelState();
  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await installDuelApi(host, { playerId: 1, displayName: 'Ada', state });
  await installDuelApi(guest, { playerId: 2, displayName: 'Bea', state });

  await host.goto('/');
  await host.locator('#start-button').click();
  await host.locator('#field-categoryCount').selectOption('3');
  await host.locator('#field-valuesPerCategory').selectOption('4');
  await host.locator('#field-difficulty').selectOption('leicht');
  await host.locator('#duel-start-button').click();
  await expect(host.locator('#duel-room-code')).toHaveText(ROOM_CODE, { timeout: 60_000 });

  await guest.goto(`/?room=${ROOM_CODE}`);
  await expect(guest.locator('#screen-duel-entry')).toHaveClass(/is-active/);
  await guest.locator('#duel-entry-submit').click();
  await expect(guest.locator('#duel-room-code')).toHaveText(ROOM_CODE, { timeout: 60_000 });
  await host.locator('#duel-ready').click();
  await guest.locator('#duel-ready').click();
  await expect(host.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 30_000 });

  await host.locator('#play-back').click();
  await expect(host.locator('#confirm-title')).toHaveText('Duell verlassen?');
  await host.locator('#confirm-cancel').click();
  await expect(host.locator('#screen-play')).toHaveClass(/is-active/);

  // Und die System-Geste muss dieselbe Antwort geben, sonst umgeht sie die Frage.
  await host.goBack();
  await expect(host.locator('#confirm-title')).toHaveText('Duell verlassen?');
  await host.locator('#confirm-ok').click();
  await expect(host.locator('#screen-start')).toHaveClass(/is-active/);

  await hostContext.close();
  await guestContext.close();
});
