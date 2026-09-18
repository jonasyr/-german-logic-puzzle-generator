import { expect, test } from '@playwright/test';
import { COUNTDOWN_MS, createDuelState, installDuelApi, ROOM_CODE } from './support/duelServer';

/*
 * A duel must build the play screen exactly once, however the client finds out
 * that the duel has begun.
 *
 * Normally the client's own countdown reaches zero first and stops the lobby.
 * When it does not - a device clock that disagrees with the server, or iOS
 * throttling timers while the app sits in the background - the client learns
 * from a poll instead, and applySnapshot calls startGame from inside poll().
 *
 * poll() then rescheduled itself unconditionally, even though startGame had
 * just ended the lobby. A second later the snapshot still read 'active',
 * startGame ran again, and openPlay rebuilt everything: the grid blinked out
 * and back, the clue sheet closed, any highlight was lost, and the progress
 * reporter was replaced before its first five-second tick could fire - which is
 * why the opponent's count never appeared either.
 */

test('a duel learned about from a poll still starts exactly once', async ({ browser }) => {
  test.setTimeout(180_000);
  const state = createDuelState();

  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();

  await installDuelApi(host, { playerId: 1, displayName: 'Ada', state });
  // The guest is told a time that lags the clock the room transitions on, so its
  // countdown is still running when the server already says 'active'.
  await installDuelApi(guest, {
    playerId: 2, displayName: 'Bea', state, clockLagMs: COUNTDOWN_MS - 1_000,
  });

  await host.goto('/');
  await host.locator('#start-button').click();
  await host.locator('#field-categoryCount').selectOption('3');
  await host.locator('#field-valuesPerCategory').selectOption('4');
  await host.locator('#field-difficulty').selectOption('leicht');
  await host.locator('#generate-button').click();
  await expect(host.locator('.puzzle')).toHaveCount(1, { timeout: 60_000 });
  await host.getByRole('button', { name: 'Duell', exact: true }).click();
  await expect(host.locator('#duel-room-code')).toHaveText(ROOM_CODE);

  await guest.goto(`/?room=${ROOM_CODE}`);
  await expect(guest.locator('#screen-duel-entry')).toHaveClass(/is-active/);
  await guest.locator('#duel-entry-submit').click();
  await expect(guest.locator('#duel-room-code')).toHaveText(ROOM_CODE, { timeout: 60_000 });

  await host.locator('#duel-ready').click();
  await guest.locator('#duel-ready').click();
  await expect(guest.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(guest.locator('#overview-canvas')).toBeVisible();

  // Node identity is the assertion: rebuilding the view detaches the cells it
  // replaces, which is precisely what the player sees as the grid blinking.
  const cell = await guest.locator('.overview-mirror__cell').first().elementHandle();
  await guest.locator('#sheet-toggle').click();
  await expect(guest.locator('#sheet-toggle')).toHaveAttribute('aria-expanded', 'true');

  // Long enough for several one-second polls inside the window where the guest
  // still thinks the countdown is running.
  await guest.waitForTimeout(4_000);

  expect(await cell!.evaluate(node => node.isConnected),
    'the grid was rebuilt underneath the player').toBe(true);
  await expect(guest.locator('#sheet-toggle'),
    'the clue sheet the player opened was closed again').toHaveAttribute('aria-expanded', 'true');
  await expect(guest.locator('#screen-play')).toHaveClass(/is-active/);

  /*
   * And the opponent's count arrives - the second half of the same bug.
   *
   * createProgressReporter first reports five seconds after play begins. While
   * openPlay ran again every second the reporter was torn down and replaced
   * before that tick could ever fire, so the count stayed invisible however
   * long you waited. The existing duel spec asserts the counts, but only along
   * the path where the countdown starts the game - which is exactly why a
   * player whose clock lagged saw nothing and no test complained.
   */
  await expect(host.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 30_000 });
  await expect(host.locator('#overview-canvas')).toBeVisible();
  const hostCells = host.locator('.overview-mirror__cell');
  for (const index of [0, 1]) {
    const box = (await hostCells.nth(index).boundingBox())!;
    await host.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect(guest.locator('#duel-progress'))
    .toHaveText('Gegner: 2 Felder gesetzt', { timeout: 30_000 });

  await hostContext.close();
  await guestContext.close();
});
