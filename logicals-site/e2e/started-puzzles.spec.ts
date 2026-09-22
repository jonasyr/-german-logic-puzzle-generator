import { expect, test, type Page } from '@playwright/test';

/*
 * Der ganze Weg, nicht die Bausteine.
 *
 * Die Fehler dieses Vorhabens liegen ZWISCHEN den Bausteinen: der Stand wird
 * geschrieben, aber nicht gefunden; er wird gefunden, aber nicht gezeichnet;
 * er wird gezeichnet, aber der Knopf meint einen anderen. Jeder Baustein fuer
 * sich ist in test/saved-games.test.ts belegt - hier geht es um die Fugen.
 */

async function withPlayer(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('logicals.players.v1', JSON.stringify({
      players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
    }));
    localStorage.setItem('logicals.seenIntro.v1', '1');
  });
  await page.route('**/api/players/*/solved-seeds', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ seeds: [] }),
  }));
  await page.route('**/api/results', route => route.fulfill({
    status: 201, contentType: 'application/json', body: JSON.stringify({ result: {} }),
  }));
}

test('vom ersten Tipp bis zum Haken', async ({ page }) => {
  test.setTimeout(240_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await withPlayer(page);
  await page.goto('/');
  await expect(page.locator('#collection-button')).toBeEnabled({ timeout: 60_000 });

  // 1. Anfangen.
  await page.locator('#collection-button').click();
  await page.locator('.chapter-row').first().click();
  await page.locator('.entry-row').first().click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });
  await page.locator('#overview-mark-yes').evaluate((b: HTMLButtonElement) => b.click());
  await page.locator('.play-pager .cell').evaluateAll(cells => {
    for (const cell of cells.slice(0, 3)) (cell as HTMLButtonElement).click();
  });
  await page.waitForTimeout(300);
  await page.locator('#play-back').click();

  // 2. Die Kapitelansicht zeigt es.
  await expect(page.locator('.entry-row').first()).toContainText('Angefangen · 3 von 12');

  // 3. Die Kapiteluebersicht zaehlt es.
  await page.locator('#screen-chapter .btn--back').click();
  await expect(page.locator('.chapter-row').first()).toContainText('1 angefangen');

  // 4. Der Startbildschirm bietet es an - mit der Nummer aus dem Katalog.
  await page.goto('/');
  await expect(page.locator('#resume-button')).toBeVisible();
  await expect(page.locator('#resume-detail')).toContainText('Finale beim Street-Food-Festival · Nr. 1');
  // Dasselbe Mass wie in der Sammlung, nicht ein zweites.
  await expect(page.locator('#resume-detail')).toContainText('3 von 12');

  // 5. Zurueck ueber den Knopf, zu Ende loesen.
  await page.locator('#resume-button').click();
  await expect(page.locator('#overview-canvas')).toBeVisible({ timeout: 120_000 });

  /*
   * Erst leeren, dann loesen.
   *
   * Die drei wiederhergestellten Zellen stehen bereits auf "sicher", und ein
   * zweiter Tipp mit demselben Werkzeug nimmt eine Markierung wieder weg -
   * das Gitter waere am Ende unvollstaendig. Dass der Stand wirklich
   * zurueckkam, ist oben schon belegt.
   */
  await page.locator('#play-clear').click();
  await page.locator('#confirm-ok').click();
  await expect(page.locator('#play-undo')).toBeDisabled();

  await page.locator('#play-solution-button').evaluate((b: HTMLButtonElement) => b.click());
  await page.locator('#confirm-ok').click();
  const labels = await page.locator('#play-solution-table').evaluate(container => {
    const headers = [...container.querySelectorAll('th')].map(cell => cell.textContent || '');
    return [...container.querySelectorAll('tbody tr')].flatMap(row => {
      const values = [...row.querySelectorAll('td')].map(cell => cell.textContent || '');
      return headers.flatMap((_, left) => headers.slice(left + 1).map((__, offset) =>
        `${values[left]} / ${values[left + offset + 1]}`));
    });
  });
  await page.locator('#overview-mark-yes').evaluate((b: HTMLButtonElement) => b.click());
  await page.locator('.play-pager .cell').evaluateAll((cells, wanted) => {
    for (const label of wanted as string[]) {
      const cell = cells.find(c => (c as HTMLElement).dataset.label === label) as HTMLButtonElement;
      cell?.click();
    }
  }, labels);
  await expect(page.locator('#solved-dialog')).toBeVisible({ timeout: 60_000 });

  /*
   * 6. Geloest ist kein angefangenes Raetsel mehr.
   *
   * Der Knopf verschwindet, weil newestSavedGame geloeste Staende uebergeht -
   * und die Kapitelansicht zeigt den Haken statt des Balkens, weil ein
   * geloester Eintrag keine Fortschrittszeile braucht.
   */
  await page.goto('/');
  await expect(page.locator('#resume-button')).toBeHidden();
});

test('bei gesperrtem Speicher bleibt die Sammlung bedienbar', async ({ page }) => {
  test.setTimeout(120_000);
  await withPlayer(page);
  /*
   * Privater Modus: das Durchgehen wirft, und die Sammlung muss aussehen wie
   * vorher - nicht leer, nicht kaputt. Nur `length` wird gesperrt, weil genau
   * daran das Durchgehen haengt; alles andere muss weiter gehen, sonst kaeme
   * die App gar nicht erst hoch.
   */
  await page.addInitScript(() => {
    const echt = window.localStorage;
    Object.defineProperty(window, 'localStorage', {
      configurable: true,
      value: new Proxy(echt, {
        get(ziel, name) {
          if (name === 'length') throw new DOMException('SecurityError');
          const wert = Reflect.get(ziel, name);
          return typeof wert === 'function' ? wert.bind(ziel) : wert;
        },
      }),
    });
  });
  await page.goto('/');
  await expect(page.locator('#collection-button')).toBeEnabled({ timeout: 60_000 });
  await page.locator('#collection-button').click();
  await expect(page.locator('.chapter-row')).toHaveCount(10);
  await page.locator('.chapter-row').first().click();
  await expect(page.locator('.entry-row')).toHaveCount(12);
});
