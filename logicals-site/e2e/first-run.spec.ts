import { expect, test, type Page } from '@playwright/test';
import { CELL_SELECTORS, findOccludedCells, findVeiledCells, openSoloPuzzle } from './support/layoutGuard';

/*
 * Die Werkzeuge erklaeren sich nicht von selbst.
 *
 * Ihre Bedeutung stand ausschliesslich im aria-label: ein Screenreader-Nutzer
 * wurde informiert, ein sehender nicht. "␣" fuer loeschen ist nicht erratbar,
 * und die Markierung "vermutet" kam in der Oberflaeche gar nicht vor.
 *
 * Dazu ein stiller vierter Zustand: das aktive Werkzeug erneut zu druecken legt
 * es weg (markTool.js), und danach bleibt jeder Tipp auf dem Gitter wirkungslos
 * - ohne dass irgendwo steht, warum.
 */

/** Ein Spieler, der schon einmal hier war - also ohne Einfuehrung. */
async function returningPlayer(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('logicals.players.v1', JSON.stringify({
      players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
    }));
    localStorage.setItem('logicals.seenIntro.v1', '1');
  });
  await page.route('**/api/players**', route => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ players: [{ id: 1, displayName: 'Ada', createdAt: '2026-09-17T00:00:00Z' }] }),
  }));
  await page.route('**/api/players/*/results**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));
}

/*
 * Nach dem Anlegen des ersten Spielers muss der Startbildschirm vollstaendig
 * sein.
 *
 * updateStart() schaltete Start-, Duell- und Ergebnis-Knopf frei, aber nicht
 * den Tagesraetsel-Knopf und keine der Unterzeilen - die macht
 * refreshStartScreen(), und die lief nur beim Laden und beim Verlassen des
 * Spiels. Der erste Bildschirm nach der Anmeldung zeigte deshalb eine
 * ausgegraute Hauptaktion ohne Erklaerung, bis man neu lud. Eine Durchsicht
 * konnte das nicht von "kaputt" unterscheiden.
 */
test('nach dem ersten Spieler ist der Startbildschirm vollstaendig', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  // Noch kein Spieler: der Dialog steht offen.
  await page.route('**/api/players', route => route.fulfill({
    status: route.request().method() === 'POST' ? 201 : 200,
    contentType: 'application/json',
    body: route.request().method() === 'POST'
      ? JSON.stringify({ player: { id: 7, displayName: 'Neu', createdAt: '2026-09-21T00:00:00Z' } })
      : JSON.stringify({ players: [] }),
  }));
  await page.route('**/api/players/*/results**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));

  await page.goto('/');
  await page.locator('#player-name').fill('Neu');
  await page.locator('#player-dialog button[type="submit"]').click();

  // Die Hauptaktion ist bedienbar und sagt, was sie anbietet.
  const daily = page.locator('#daily-button');
  await expect(daily).toBeEnabled();
  await expect(page.locator('#daily-detail')).not.toBeEmpty();
  await expect(page.locator('#start-button')).toBeEnabled();
});

test('die Einfuehrung erscheint einmal und dann nie wieder', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  // Ohne die Marke: ein Spieler, der zum ersten Mal ein Raetsel oeffnet.
  await page.addInitScript(() => localStorage.setItem('logicals.players.v1', JSON.stringify({
    players: [{ id: 1, displayName: 'Ada' }], selectedPlayerId: 1,
  })));
  await page.route('**/api/players/*/results**', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ results: [] }),
  }));

  await page.goto('/');
  await expect(page.locator('#daily-button')).toBeEnabled({ timeout: 30_000 });
  await page.locator('#daily-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });

  await expect(page.locator('#intro-dialog')).toBeVisible();
  // Alle vier Zeichen werden benannt - "␣" ist das, das niemand erraet.
  for (const symbol of ['×', '○', '·', '␣']) {
    await expect(page.locator('#intro-dialog')).toContainText(symbol);
  }
  await expect(page.locator('#intro-dialog')).toContainText('schließt aus');
  // Und der stille vierte Zustand, der jeden Tipp wirkungslos macht.
  await expect(page.locator('#intro-dialog')).toContainText('legt es weg');
  await page.locator('#intro-close').click();
  await expect(page.locator('#intro-dialog')).toBeHidden();

  // Beim naechsten Raetsel nicht mehr - sonst waere sie eine Huerde statt einer Hilfe.
  await page.locator('#play-back').click();
  await page.locator('#daily-button').click();
  await expect(page.locator('#screen-play')).toHaveClass(/is-active/, { timeout: 120_000 });
  await expect(page.locator('#intro-dialog')).toBeHidden();
});

/*
 * Die Legende steht zum Nachschlagen bereit - aber nicht im Spiel.
 *
 * Sie stand dauerhaft unter den Werkzeugknoepfen, weil ihre Bedeutung vorher
 * nur im aria-label stand. Gemessen kostete sie dort 36px von 233px
 * Gitterhoehe, rund 15 Prozent, fuer eine Auskunft, die man hoechstens einmal
 * braucht. Erklaert wird sie jetzt einmal in der Einfuehrung und steht in den
 * Einstellungen zum Nachschlagen; die aria-labels tragen die Bedeutung
 * weiterhin.
 */
test('die Werkzeug-Zeichen stehen in den Einstellungen, nicht im Spiel', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await returningPlayer(page);
  await openSoloPuzzle(page);

  /*
   * Nicht im Spiel - dort zaehlt jede Zeile gegen das Gitter.
   *
   * Geprueft wird der Ort UND die Sichtbarkeit. "Existiert nicht" waere
   * falsch: die Legende liegt im selben Dokument, auf dem Einstellungs-
   * Bildschirm, der nur gerade nicht aktiv ist.
   */
  await expect(page.locator('#screen-play #tool-legend')).toHaveCount(0);
  await expect(page.locator('#tool-legend')).toBeHidden();
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);

  // Aber auffindbar: das Zahnrad im Spiel fuehrt zu den Einstellungen.
  await page.locator('#play-settings').click();
  const legend = page.locator('#tool-legend');
  await expect(legend).toBeVisible();
  for (const word of ['ausgeschlossen', 'sichere Zuordnung', 'vermutet', 'löschen']) {
    await expect(legend).toContainText(word);
  }
});

/*
 * Das weggelegte Werkzeug wird benannt - und verdeckt dabei nichts.
 *
 * Der Titel sagte frueher "ohne das Gitter zu ruehren". Diese Regel ist
 * aufgegeben: die Statuszeile belegt keinen Platz mehr, solange sie nichts zu
 * sagen hat, weil die Reservierung auf dem Telefon rund 44px Gitterhoehe
 * kostete. Das Gitter darf sich also bewegen. Was es nicht darf, ist
 * verschwinden - deshalb stehen hier beide Waechter.
 */
test('der weggelegte Werkzeug-Zustand wird benannt, ohne etwas zu verdecken', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await returningPlayer(page);
  await openSoloPuzzle(page);

  // Das aktive Werkzeug erneut druecken legt es weg.
  await page.locator('#overview-mark-no').click();
  await expect(page.locator('#play-status')).toContainText('Kein Werkzeug');
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);
  expect(await findVeiledCells(page, CELL_SELECTORS.overview)).toEqual([]);

  // Und wieder aufnehmen raeumt die Meldung weg - restlos, samt ihrer Hoehe.
  await page.locator('#overview-mark-no').click();
  await expect(page.locator('#play-status')).toBeEmpty();
});
