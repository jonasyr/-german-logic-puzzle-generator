import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
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
