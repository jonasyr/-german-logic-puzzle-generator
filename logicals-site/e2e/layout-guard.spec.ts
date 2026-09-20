import { expect, test } from '@playwright/test';
import {
  CELL_SELECTORS, PHONES, findOccludedCells, findVeiledCells,
  findUndersizedControls, hasHorizontalScroll, openSoloPuzzle,
} from './support/layoutGuard';

for (const phone of PHONES) {
  test(`${phone.name}: nichts verdeckt das Gitter`, async ({ page }) => {
    test.setTimeout(180_000);
    await page.setViewportSize(phone.viewport);
    await openSoloPuzzle(page);

    expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);
    expect(await findUndersizedControls(page)).toEqual([]);
    expect(await hasHorizontalScroll(page)).toBe(false);

    // Und in der Einzelansicht, die ihre Zellen anders ablegt.
    await page.locator('#play-view').click();
    await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
    expect(await findOccludedCells(page, CELL_SELECTORS.pager)).toEqual([]);
    expect(await hasHorizontalScroll(page)).toBe(false);
  });
}

/*
 * Eine erscheinende Meldung darf das Gitter VERSCHIEBEN, aber nichts verdecken.
 *
 * Hier stand die umgekehrte Regel: die Meldung durfte das Gitter nicht
 * bewegen. Erfuellen liess sich das nur, indem sie dauerhaft Platz belegte
 * oder als Overlay auf dem Gitter lag - und das Overlay verdeckte genau die
 * Zelle, auf die es zeigte. Die dauerhafte Reservierung kostete auf dem
 * Telefon rund 44px Gitterhoehe.
 *
 * Der Auftraggeber hat entschieden: das Gitter so gross wie moeglich, der
 * Sprung ist der Preis. Geprueft wird deshalb, was geblieben ist - keine
 * verdeckte und keine verhuellte Zelle, in beiden Ansichten.
 */
/*
 * Die Reiterleiste waechst nicht mit dem Fenster.
 *
 * `.play-pager` hatte zwei `auto`-Zeilen, und `align-content: stretch` - die
 * Voreinstellung - verteilt ueberschuessige Hoehe gleichmaessig auf beide. Die
 * Leiste wuchs damit im selben Mass wie das Gitter: gemessen 172px bei
 * 390x844, mit einem 164px hohen Reiter fuer eine einzeilige Beschriftung, ein
 * Fuenftel des Schirms direkt ueber dem Gitter.
 *
 * Unsichtbar war das, weil es nur bei UEBERSCHUSS auftritt. Bei 320x568 gibt
 * es keinen, dort waren es immer korrekte 52px - und 320 ist die Breite, an
 * der sonst alles zuerst bricht und auf die deshalb alle zuerst schauen. Zwei
 * vollstaendige Screenshot-Durchsichten sind daran vorbeigelaufen.
 *
 * Geprueft wird am hohen Fenster, wo der Ueberschuss entsteht, und gegen die
 * Tapflaeche statt gegen eine feste Zahl: die Leiste ist eine Reihe von
 * Knoepfen, mehr als deren Hoehe plus Polster hat sie nicht zu brauchen.
 */
/*
 * Der Geloest-Dialog bleibt bei 320px bedienbar.
 *
 * Er ist dort ohnehin eng - die Beschriftungen seiner drei Kacheln stiessen
 * bis vor kurzem aneinander -, und der Erfahrungsblock hat ihn um eine Zeile
 * und einen Balken wachsen lassen. Genau die Sorte Zuwachs, die so etwas
 * wieder bricht.
 *
 * Geprueft wird das Wesentliche: beide Knoepfe im Fenster und gross genug, und
 * kein Querlauf. Wenn der Dialog zu hoch wird, rutscht "Zur Startseite" unter
 * die Kante - und damit der einzige Weg vom geloesten Raetsel zurueck.
 */
test('der Geloest-Dialog bleibt bei 320px erreichbar', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 320, height: 568 });
  await openSoloPuzzle(page);

  await page.evaluate(() => {
    const block = document.getElementById('solved-xp')!;
    document.getElementById('solved-xp-gain')!.textContent = '+56';
    document.getElementById('solved-xp-level')!.textContent = 'Stufe 12';
    document.getElementById('solved-xp-fill')!.setAttribute('style', 'width: 64%');
    block.hidden = false;
    (document.getElementById('solved-dialog') as HTMLDialogElement).showModal();
  });
  await page.waitForTimeout(200);

  const lage = await page.evaluate(() => {
    const rect = (id: string) => document.getElementById(id)!.getBoundingClientRect();
    return {
      heim: rect('solved-home'),
      bleiben: rect('solved-stay'),
      fenster: window.innerHeight,
      querlauf: document.documentElement.scrollWidth > window.innerWidth,
    };
  });

  expect(lage.querlauf, 'der Dialog laeuft seitlich ueber').toBe(false);
  for (const [name, knopf] of Object.entries({ heim: lage.heim, bleiben: lage.bleiben })) {
    expect(knopf.bottom, `${name} liegt unter der Kante`).toBeLessThanOrEqual(lage.fenster + 1);
    expect(knopf.top, `${name} liegt ueber der Kante`).toBeGreaterThanOrEqual(-1);
    expect(knopf.height, `${name} ist zu flach`).toBeGreaterThanOrEqual(43.5);
  }
});

test('die Reiterleiste waechst nicht mit der Fensterhoehe', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await openSoloPuzzle(page);
  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
  await page.waitForTimeout(400);

  const hoehen = await page.evaluate(() => {
    const nav = document.getElementById('pager-nav')!;
    return {
      leiste: nav.getBoundingClientRect().height,
      reiter: Math.max(...[...nav.children].map(c => c.getBoundingClientRect().height)),
    };
  });
  expect(hoehen.reiter, `ein einzeiliger Reiter ist ${hoehen.reiter}px hoch`)
    .toBeLessThan(60);
  expect(hoehen.leiste, `die Leiste ist ${hoehen.leiste}px hoch`).toBeLessThan(72);
});

test('eine erscheinende Meldung verdeckt keine Zelle', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(PHONES[1].viewport);
  await openSoloPuzzle(page);

  // "Pruefen" auf leerem Gitter braucht keine Rueckfrage und schreibt sofort
  // in die Statuszeile - der kuerzeste Weg zu erscheinendem Text.
  await page.locator('#play-check').click();
  await expect(page.locator('#play-status')).not.toBeEmpty();

  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);
  expect(await findVeiledCells(page, CELL_SELECTORS.overview)).toEqual([]);

  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
  expect(await findOccludedCells(page, CELL_SELECTORS.pager)).toEqual([]);
  expect(await findVeiledCells(page, CELL_SELECTORS.pager)).toEqual([]);
});

/*
 * Ein Waechter, dessen Versagen nie beobachtet wurde, ist kein Waechter.
 *
 * Hier wird absichtlich das gepflanzt, wovor der Auftraggeber gewarnt hat -
 * Text ueber dem Gitter - und belegt, dass es auffaellt. Zusaetzlich wird die
 * harmlose Variante gepflanzt, damit der Waechter nicht einfach alles meldet.
 */
test('der Waechter schlaegt bei einem gepflanzten Verstoss aus', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(PHONES[1].viewport);
  await openSoloPuzzle(page);
  expect(await findOccludedCells(page, CELL_SELECTORS.overview)).toEqual([]);

  const plant = (pointerEvents: string) => page.evaluate((mode) => {
    document.getElementById('planted')?.remove();
    const cell = document.querySelector('.overview-mirror__cell')!;
    const rect = cell.getBoundingClientRect();
    const node = document.createElement('p');
    node.id = 'planted';
    node.textContent = 'Eine Meldung mitten im Gitter';
    node.style.cssText = `position:fixed;z-index:99;background:#fff;margin:0;`
      + `left:${rect.left - 10}px;top:${rect.top - 10}px;width:120px;height:60px;`
      + `pointer-events:${mode};`;
    document.body.append(node);
  }, pointerEvents);

  await plant('auto');
  const caught = await findOccludedCells(page, CELL_SELECTORS.overview);
  expect(caught.length, 'ein tippfangendes Overlay muss auffallen').toBeGreaterThan(0);
  expect(caught[0].covering).toContain('#planted');

  // Dasselbe Element ohne Tippfang ist ein erlaubtes Overlay.
  await plant('none');
  expect(await findOccludedCells(page, CELL_SELECTORS.overview),
    'ein Overlay mit pointer-events:none darf nicht gemeldet werden').toEqual([]);
});

/*
 * Dieselbe Probe fuer die Einzelansicht, und zwar im Querformat.
 *
 * Dort gilt eine Nachsicht, die es sonst nicht gibt: die Seite des Pagers
 * scrollt, weil vier Zeilen in ein 390px hohes Fenster nicht passen, und eine
 * weggescrollte Zelle wird nicht gemeldet. Genau diese Nachsicht koennte eine
 * echte Verdeckung mit durchlassen - also wird hier belegt, dass sie es nicht
 * tut. Der Pager war die Ansicht, in der die letzten Fehler steckten.
 */
test('der Waechter schlaegt auch in der Einzelansicht quer aus', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize(PHONES[2].viewport);
  await openSoloPuzzle(page);
  await page.locator('#play-view').click();
  await expect(page.locator('#screen-play')).toHaveAttribute('data-view', 'pager');
  expect(await findOccludedCells(page, CELL_SELECTORS.pager)).toEqual([]);

  // Auf eine Zelle, die wirklich zu sehen ist - sonst pruefte die Probe nur
  // die Beschneidung, die ohnehin uebersprungen wird.
  const covered = await page.evaluate(() => {
    const page0 = document.querySelector('.pair-page')!.getBoundingClientRect();
    const cell = [...document.querySelectorAll('.cell')].find(node => {
      const rect = node.getBoundingClientRect();
      return rect.top >= page0.top && rect.bottom <= page0.bottom;
    })!;
    const rect = cell.getBoundingClientRect();
    const node = document.createElement('p');
    node.id = 'planted-pager';
    node.textContent = 'Werkzeugleiste ueber dem Gitter';
    node.style.cssText = 'position:fixed;z-index:99;background:#fff;margin:0;'
      + `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;`;
    document.body.append(node);
    return cell.getAttribute('aria-label');
  });

  const caught = await findOccludedCells(page, CELL_SELECTORS.pager);
  expect(caught.map(entry => entry.label), `${covered} muss auffallen`).toContain(covered);
  expect(caught[0].covering).toContain('#planted-pager');
});
