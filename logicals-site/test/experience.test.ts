import { describe, expect, it } from 'vitest';
import { experienceFor, sumExperience } from '../worker/services/experience';
import { LEVEL_FLOORS, levelAt } from '../client/js/stats/level.js';

/*
 * Erfahrung misst die Arbeit, nicht die Zeit und nicht die Anzahl.
 *
 * Hinge sie an der Dauer, waere Troedeln die beste Strategie. Hinge sie an der
 * Anzahl, waeren viele winzige Raetsel das beste Verhaeltnis. Die Zellenzahl
 * misst, wie viel tatsaechlich zu entscheiden war.
 */

const ergebnis = (
  categoryCount: number,
  valuesPerCategory: number,
  difficulty: string,
  failedChecks: number,
) => ({
  difficulty,
  failedChecks,
  configurationJson: JSON.stringify({ categoryCount, valuesPerCategory }),
});

describe('Erfahrung je Raetsel', () => {
  it('rechnet die Beispiele aus dem Entwurf', () => {
    expect(experienceFor(ergebnis(3, 4, 'leicht', 1))).toBe(5);
    expect(experienceFor(ergebnis(4, 4, 'mittel', 1))).toBe(13);
    expect(experienceFor(ergebnis(5, 5, 'schwer', 1))).toBe(45);
  });

  it('belohnt eine Loesung ohne Fehlpruefung, ohne die andere zu bestrafen', () => {
    const sauber = experienceFor(ergebnis(5, 5, 'schwer', 0));
    const mitPruefung = experienceFor(ergebnis(5, 5, 'schwer', 3));
    expect(sauber).toBe(56);
    expect(mitPruefung).toBe(45);
    // Der Bonus ist ein Bonus: wer prueft, bekommt den vollen Grundwert.
    expect(mitPruefung).toBeGreaterThan(0);
    // Und die Anzahl der Pruefungen aendert nichts - eine oder zehn ist gleich.
    expect(experienceFor(ergebnis(5, 5, 'schwer', 10))).toBe(mitPruefung);
  });

  it('waechst mit der Schwierigkeit bei gleichem Gitter', () => {
    const leicht = experienceFor(ergebnis(4, 4, 'leicht', 1));
    const mittel = experienceFor(ergebnis(4, 4, 'mittel', 1));
    const schwer = experienceFor(ergebnis(4, 4, 'schwer', 1));
    expect(leicht).toBeLessThan(mittel);
    expect(mittel).toBeLessThan(schwer);
  });

  it('waechst mit dem Gitter bei gleicher Schwierigkeit', () => {
    const klein = experienceFor(ergebnis(3, 3, 'mittel', 1));
    const gross = experienceFor(ergebnis(5, 5, 'mittel', 1));
    expect(klein).toBeLessThan(gross);
  });

  /*
   * Unbekannte oder fehlende Angaben duerfen nicht in NaN enden - eine Zahl,
   * die niemand erklaeren kann, ist schlimmer als eine vorsichtige.
   */
  it('faellt bei unbrauchbaren Angaben auf null zurueck statt auf NaN', () => {
    expect(experienceFor({ difficulty: 'leicht', failedChecks: 0, configurationJson: 'kaputt' }))
      .toBe(0);
    expect(experienceFor({ difficulty: 'leicht', failedChecks: 0, configurationJson: '{}' }))
      .toBe(0);
    expect(experienceFor({ difficulty: 'unbekannt', failedChecks: 0, configurationJson: JSON.stringify({ categoryCount: 4, valuesPerCategory: 4 }) }))
      .toBeGreaterThan(0);
  });

  it('braucht mindestens zwei Kategorien, sonst gibt es keine Zelle', () => {
    expect(experienceFor(ergebnis(1, 5, 'schwer', 0))).toBe(0);
  });
});

describe('Summe ueber alle Ergebnisse', () => {
  it('summiert und zaehlt', () => {
    const summe = sumExperience([
      ergebnis(3, 4, 'leicht', 1),
      ergebnis(5, 5, 'schwer', 0),
    ]);
    expect(summe).toEqual({ xp: 5 + 56, solved: 2 });
  });

  it('faellt nie, wenn Ergebnisse dazukommen', () => {
    // Das ist die Leitregel: was man ansammelt, darf nicht sinken.
    const liste = [ergebnis(3, 4, 'leicht', 1)];
    let vorher = sumExperience(liste).xp;
    for (const naechstes of [ergebnis(4, 4, 'mittel', 2), ergebnis(5, 5, 'schwer', 0)]) {
      liste.push(naechstes);
      const jetzt = sumExperience(liste).xp;
      expect(jetzt).toBeGreaterThanOrEqual(vorher);
      vorher = jetzt;
    }
  });

  it('ist bei keinem Ergebnis null und nicht undefined', () => {
    expect(sumExperience([])).toEqual({ xp: 0, solved: 0 });
  });
});

describe('Stufen', () => {
  it('beginnt bei Stufe 1', () => {
    expect(levelAt(0).level).toBe(1);
    expect(levelAt(39).level).toBe(1);
  });

  it('steigt genau an den Schwellen', () => {
    for (const [index, schwelle] of LEVEL_FLOORS.entries()) {
      expect(levelAt(schwelle).level, `Schwelle ${schwelle}`).toBe(index + 1);
      if (schwelle > 0) {
        expect(levelAt(schwelle - 1).level, `kurz vor ${schwelle}`).toBe(index);
      }
    }
  });

  it('nennt den Weg zur naechsten Stufe', () => {
    const bei = levelAt(812);
    expect(bei.level).toBe(7);
    expect(bei.floor).toBe(800);
    expect(bei.next).toBe(1100);
    expect(bei.intoLevel).toBe(12);
    expect(bei.levelSpan).toBe(300);
  });

  it('laeuft ueber die letzte feste Schwelle hinaus weiter', () => {
    const letzte = LEVEL_FLOORS[LEVEL_FLOORS.length - 1];
    expect(levelAt(letzte).level).toBe(LEVEL_FLOORS.length);
    expect(levelAt(letzte + 700).level).toBe(LEVEL_FLOORS.length + 1);
    expect(levelAt(letzte + 1400).level).toBe(LEVEL_FLOORS.length + 2);
  });

  it('steigt monoton', () => {
    let vorher = 0;
    for (let xp = 0; xp <= 5000; xp += 37) {
      const stufe = levelAt(xp).level;
      expect(stufe).toBeGreaterThanOrEqual(vorher);
      vorher = stufe;
    }
  });
});
