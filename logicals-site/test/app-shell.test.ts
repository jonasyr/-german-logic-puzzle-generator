import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Sites app shell', () => {
  it('keeps the existing Logicals iOS shell', () => {
    const html = readFileSync(resolve('client/index.html'), 'utf8');
    expect(html).toContain('viewport-fit=cover');
    expect(html).toContain('id="screen-start"');
    expect(html).toContain('id="screen-play"');
    expect(html).toContain('./js/main.js');
  });
});

describe('iOS-Statusleiste', () => {
  it('lässt den Inhalt nicht unter die Statusleiste reichen', () => {
    /*
     * "black-translucent" zwingt iOS zu weissen Symbolen und schiebt den Inhalt
     * darunter. Die oberste gemalte Flaeche ist der Seitenhintergrund - im
     * hellen Modus gemessen rgb(251, 250, 247), weil #app den sicheren Bereich
     * nur als Polsterung freilaesst. Weisse Uhrzeit auf nahezu weissem Grund.
     *
     * Wer es zurueckholen will, muss zuerst dafuer sorgen, dass dieser Streifen
     * auf jedem Bildschirm dunkel gemalt wird.
     */
    // Auf das Meta-Element geprueft, nicht auf den Rohtext: die Begruendung
    // daneben darf das Wort nennen, das sie verbietet.
    const html = readFileSync(resolve('client/index.html'), 'utf8');
    expect(html).not.toMatch(/<meta[^>]*apple-mobile-web-app-status-bar-style/);
    // Die seitlichen und unteren Einzuege braucht das Layout weiterhin.
    expect(html).toContain('viewport-fit=cover');
  });
});
