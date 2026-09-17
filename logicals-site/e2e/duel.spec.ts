import { expect, test, type Page, type Route } from '@playwright/test';

type Member = { playerId: number; displayName: string; role: 'host' | 'guest'; loaded: boolean; ready: boolean };

test('two devices load the same runtime puzzle and enter play from one start instant', async ({ browser }) => {
  const state: {
    room: null | Record<string, any>;
    members: Member[];
    tokens: Record<number, string>;
    results: Array<Record<string, any>>;
  } = { room: null, members: [], tokens: {}, results: [] };

  const installApi = async (page: Page, playerId: number, displayName: string) => {
    await page.addInitScript(({ playerId, displayName }) => localStorage.setItem('logicals.players.v1', JSON.stringify({
      players: [{ id: playerId, displayName }], selectedPlayerId: playerId,
    })), { playerId, displayName });
    await page.route('**/api/**', async (route: Route) => {
      const request = route.request();
      const url = new URL(request.url());
      const json = (value: unknown, status = 200) => route.fulfill({
        status, contentType: 'application/json', body: JSON.stringify(value),
      });
      if (url.pathname === '/api/players') {
        return json({ players: [{ id: playerId, displayName, createdAt: '2026-09-17T00:00:00Z' }] });
      }
      const body = request.method() === 'POST' ? request.postDataJSON() : {};
      if (url.pathname === '/api/rooms' && request.method() === 'POST') {
        state.members = [{ playerId, displayName, role: 'host', loaded: true, ready: false }];
        state.tokens[playerId] = 'host-token';
        state.room = {
          id: 7, code: 'ABC234', state: 'waiting', serverNow: Date.now(), startsAt: null,
          expiresAt: Date.now() + 86_400_000, configuration: body.configuration,
          bookletSeed: body.bookletSeed, puzzleIndex: body.puzzleIndex,
          puzzleFingerprint: body.puzzleFingerprint, puzzleTitle: body.puzzleTitle,
          puzzleThemeId: body.puzzleThemeId, effectivePuzzleSeed: body.effectivePuzzleSeed, results: [],
        };
        return json({ room: { ...state.room, members: state.members }, memberToken: state.tokens[playerId] }, 201);
      }
      if (!state.room) return json({ error: 'missing room' }, 404);
      if (url.pathname === '/api/results' && request.method() === 'POST') {
        const member = state.members.find(candidate => candidate.playerId === body.playerId)!;
        state.results.push({
          playerId: body.playerId, displayName: member.displayName, elapsedMs: body.elapsedMs,
          failedChecks: body.failedChecks, completedAt: new Date().toISOString(), outcome: 'waiting',
        });
        if (state.results.length === 2) {
          const winner = state.results[0].elapsedMs <= state.results[1].elapsedMs ? 0 : 1;
          state.results.forEach((result, index) => { result.outcome = index === winner ? 'won' : 'lost'; });
          state.room.state = 'complete';
        }
        state.room.results = state.results;
        return json({ result: body }, 201);
      }
      if (url.pathname.endsWith('/join')) {
        state.members.push({ playerId, displayName, role: 'guest', loaded: true, ready: false });
        state.tokens[playerId] = 'guest-token';
        return json({ room: { ...state.room, serverNow: Date.now(), members: state.members }, memberToken: state.tokens[playerId] }, 201);
      }
      if (url.pathname.endsWith('/loaded')) {
        const member = state.members.find(candidate => candidate.playerId === body.playerId)!;
        member.loaded = true;
        return json({ room: { ...state.room, serverNow: Date.now(), members: state.members } });
      }
      if (url.pathname.endsWith('/ready')) {
        const member = state.members.find(candidate => candidate.playerId === body.playerId)!;
        member.ready = true;
        if (state.members.length === 2 && state.members.every(candidate => candidate.ready) && !state.room.startsAt) {
          state.room.startsAt = Date.now() + 4_000;
          state.room.state = 'countdown';
        }
        return json({ room: { ...state.room, serverNow: Date.now(), members: state.members } });
      }
      if (request.method() === 'GET' && url.pathname === '/api/rooms/ABC234') {
        return json({ room: { ...state.room, serverNow: Date.now(), members: state.members } });
      }
      return json({ error: 'unknown route' }, 404);
    });
  };

  const hostContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const guestContext = await browser.newContext({ viewport: { width: 768, height: 1024 } });
  const host = await hostContext.newPage();
  const guest = await guestContext.newPage();
  await installApi(host, 1, 'Ada');
  await installApi(guest, 2, 'Bea');

  await host.goto('/');
  await host.locator('#start-button').click();
  await host.locator('#field-puzzleCount').selectOption('1');
  await host.locator('#field-categoryCount').selectOption('3');
  await host.locator('#field-valuesPerCategory').selectOption('4');
  await host.locator('#field-difficulty').selectOption('leicht');
  await host.locator('#generate-button').click();
  await expect(host.locator('.puzzle')).toHaveCount(1, { timeout: 30_000 });
  await host.getByRole('button', { name: 'Duell', exact: true }).click();
  await expect(host.locator('#duel-room-code')).toHaveText('ABC234');
  await host.reload();
  await expect(host.locator('#duel-room-code')).toHaveText('ABC234');

  await guest.goto('/?room=ABC234');
  await expect(guest.locator('#screen-duel-entry')).toHaveClass(/is-active/);
  await guest.locator('#duel-entry-submit').click();
  await expect(guest.locator('#duel-room-code')).toHaveText('ABC234', { timeout: 30_000 });
  await guest.reload();
  await expect(guest.locator('#duel-room-code')).toHaveText('ABC234');
  await expect(host.locator('.duel-member')).toHaveCount(2, { timeout: 5_000 });

  await host.locator('#duel-ready').click();
  await guest.locator('#duel-ready').click();
  await expect(host.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 10_000 });
  await expect(guest.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 10_000 });
  await expect(host.locator('#play-title')).toHaveText(await guest.locator('#play-title').textContent() || '');

  // Marking in one room's overview must not leak into the other room's grid:
  // the puzzle is shared, the progress is not.
  await expect(host.locator('#overview-canvas')).toBeVisible();
  const hostCell = host.locator('.overview-mirror__cell').first();
  const hostKey = await hostCell.getAttribute('data-key');
  const box = (await hostCell.boundingBox())!;
  await host.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await host.locator('#overview-mark-no').click();
  await expect(host.locator(`.overview-mirror__cell[data-key="${hostKey}"]`))
    .toHaveAttribute('aria-label', /ausgeschlossen/);
  await expect(guest.locator(`.overview-mirror__cell[data-key="${hostKey}"]`))
    .toHaveAttribute('aria-label', /leer/);
  await host.locator('#play-undo').click();
  await expect(host.locator(`.overview-mirror__cell[data-key="${hostKey}"]`))
    .toHaveAttribute('aria-label', /leer/);

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
    await page.locator('.play-pager .cell').evaluateAll((cells, wanted) => {
      for (const label of wanted as string[]) {
        const cell = cells.find(candidate => (candidate as HTMLElement).dataset.label === label) as HTMLButtonElement;
        cell.click();
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
