import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Node ohne DOM: geprüft wird die Absicht am Quelltext, nach dem Muster von
 * test/app-shell.test.ts. Das Verhalten selbst deckt e2e/collection.spec.ts ab.
 *
 * Diese Datei hält zwei Entscheidungen fest, deren Bruch still schadet - man
 * sähe sie erst auf einem geteilten Gerät oder in der U-Bahn.
 */

const source = readFileSync(
  resolve('client/js/catalogue/solvedSeeds.js'), 'utf8');

describe('gelöste Seeds', () => {
  it('legt den Zwischenspeicher je Spieler an', () => {
    // Ein gemeinsamer Schlüssel würde einem Spieler die Haken eines anderen
    // zeigen - auf einem Gerät, das sich zwei Leute teilen, sofort sichtbar.
    expect(source).toMatch(/logicals\.solvedSeeds\.v1\.\$\{playerId\}/);
  });

  it('gibt bei totem Netz den Zwischenspeicher zurück statt zu werfen', () => {
    // Ohne Netz darf die Sammlung Haken verlieren, aber nicht unbenutzbar
    // sein: Spielen selbst braucht keine Verbindung.
    expect(source).toContain('catch');
    expect(source).toContain('cachedSolvedSeeds');
  });

  it('fragt nur den Katalogbereich ab', () => {
    // Das freie Spiel würfelt in 0…99.999; seine Seeds gehen die Sammlung
    // nichts an, und sie mitzuziehen hiesse, Treffer zu erfinden.
    expect(source).toContain('/solved-seeds');
  });
});
