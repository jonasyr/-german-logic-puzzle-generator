import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Ein Begriff pro Sache.
 *
 * Die Unit-Umgebung hat kein DOM, also wird die Oberfläche hier über ihren
 * Quelltext geprüft - nach dem Muster von app-shell.test.ts.
 */

/** Jede .js unter client/js, rekursiv. */
function clientSources(directory = resolve('client/js')): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return clientSources(path);
    return entry.name.endsWith('.js') ? [path] : [];
  });
}

const surfaces = () => [...clientSources(), resolve('client/index.html')];

/**
 * Nur das, was der Spieler zu sehen bekommt.
 *
 * Kommentare fallen heraus, und zwar absichtlich: die Begründung, warum es den
 * Heft-Bildschirm nicht mehr gibt, muss ihn beim Namen nennen dürfen. Eine
 * Regel, die das verböte, schnitte genau die Erklärungen weg, für die dieser
 * Quelltext sonst sorgt.
 *
 * Grob, aber ausreichend: `//` in einer URL würde den Rest der Zeile
 * abschneiden, und keine URL hier trägt eines der geprüften Wörter.
 */
function visibleText(source: string): string {
  return source
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

const offenders = (word: string) => surfaces()
  .filter(path => visibleText(readFileSync(path, 'utf8')).includes(word))
  .map(path => path.split('/client/')[1]);

describe('Wortschatz', () => {
  it('nennt eine fehlgeschlagene Prüfung überall gleich', () => {
    // Dieselbe Zahl hieß in der Rätselliste "Fehlversuche" und im Dialog, in
    // der Statistik und im Duell-Ergebnis "Fehlprüfungen".
    expect(offenders('Fehlversuch')).toEqual([]);
  });

  it('spricht nicht mehr vom Heft, das es nicht mehr gibt', () => {
    // Der Heft-Bildschirm ist weg; ein Text, der ihn noch erwähnt, verspricht
    // etwas, das der Spieler nirgends findet.
    expect(offenders('Heft')).toEqual([]);
  });
});
