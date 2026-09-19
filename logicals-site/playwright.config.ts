import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  /*
   * Ein eigenes Ausgabeverzeichnis je Prozess.
   *
   * Playwright leert `outputDir` beim Start jedes Laufs, und Spuren werden
   * unter `.playwright-artifacts-N/` waehrend JEDES Tests geschrieben, nicht
   * erst bei einem Fehlschlag. Zwei gleichzeitige Laeufe loeschen einander
   * also die laufenden Dateien weg. Das Ergebnis sieht aus wie ein flatternder
   * Test und ist keiner:
   *
   *   Error: ENOENT: no such file or directory, open
   *     '.../test-results/.playwright-artifacts-0/traces/47b5c1eb....trace'
   *
   * Deterministisch reproduziert: ein langer Lauf stirbt genau dann, wenn ein
   * zweiter startet - und faellt allein wiederholt grün aus. Genau die
   * Signatur, die einen halben Tag als "flatternder Test" gekostet hat.
   *
   * Die Prozesskennung trennt die Laeufe. Sie zu vergessen hiesse, sich auf
   * die Disziplin zu verlassen, nie zwei Laeufe gleichzeitig zu starten - und
   * das ist genau die Disziplin, die hier mehrfach versagt hat.
   */
  outputDir: `test-results/pid-${process.pid}`,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  use: {
    /*
     * Ohne das wartet Playwright unbegrenzt auf eine Aktion.
     *
     * Ein Klick auf einen verdeckten Knopf hat die Suite so zehn Minuten lang
     * angehalten und am Ende nichts berichtet - eine Blockade sieht dann aus
     * wie ein langsamer Lauf. Was nach 15 Sekunden nicht anklickbar ist, wird
     * es nicht mehr.
     */
    actionTimeout: 15_000,
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npx vite --host 127.0.0.1 --port 4173',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
  },
});
