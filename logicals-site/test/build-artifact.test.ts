import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Sites build artifact', () => {
  it('keeps the classic play rules script alongside the bundled client', () => {
    execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });
    expect(existsSync('dist/client/playLogic.js')).toBe(true);
  });

  it('bundles generation into a dedicated browser worker', () => {
    execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });
    const assets = readdirSync('dist/client/assets');
    expect(assets.some(file => file.startsWith('booklet.worker-'))).toBe(true);
    expect(readFileSync('client/js/api.js', 'utf8')).not.toContain('/api/booklet');
  });
});

/*
 * Was die Home-Screen-App braucht, muss im gebauten Verzeichnis unter genau dem
 * Pfad liegen, den das Betriebssystem bekommt.
 *
 * Genau das ging einmal schief: Manifest und Icons lagen neben index.html, Vite
 * hashte sie nach /assets/, und ein Manifest von dort loest sein relatives
 * start_url gegen /assets/ auf - ein Verzeichnis voller JS-Stuecke ohne Seite.
 * Die App startete vom Home-Bildschirm ins Leere.
 *
 * Die e2e-PWA-Pruefungen laufen gegen den Dev-Server, wo publicDir ohnehin an
 * der Wurzel liegt. Sie koennen diesen Fehler nicht sehen; nur das Bauwerk
 * selbst kann es.
 */
describe('PWA im gebauten Verzeichnis', () => {
  it('legt Manifest, Worker und Icons an die Wurzel, nicht in /assets', () => {
    execFileSync(process.execPath, ['scripts/build.mjs'], { stdio: 'pipe' });

    const manifestPath = 'dist/client/manifest.webmanifest';
    expect(existsSync(manifestPath), manifestPath).toBe(true);
    expect(existsSync('dist/client/sw.js'), 'dist/client/sw.js').toBe(true);

    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    // Wurzelabsolut, damit der Pfad nicht davon abhaengt, wo die Datei liegt.
    expect(manifest.start_url.startsWith('/'), manifest.start_url).toBe(true);
    expect(manifest.scope.startsWith('/'), manifest.scope).toBe(true);

    // Und jedes Icon, das das Manifest nennt, existiert auch wirklich dort.
    for (const icon of manifest.icons) {
      const iconPath = `dist/client${icon.src}`;
      expect(existsSync(iconPath), iconPath).toBe(true);
    }

    // Das Icon, das iOS statt der Manifest-Icons nimmt.
    const html = readFileSync('dist/client/index.html', 'utf8');
    const touchIcon = html.match(/rel="apple-touch-icon" href="([^"]+)"/)?.[1];
    expect(touchIcon, 'apple-touch-icon fehlt im gebauten index.html').toBeTruthy();
    expect(existsSync(`dist/client${touchIcon}`), `dist/client${touchIcon}`).toBe(true);
  });
});
