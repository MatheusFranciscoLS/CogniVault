import { defineConfig } from '@playwright/test';

/**
 * Captura de telas, NÃO é teste. Fica fora do `playwright.config.mjs` de
 * propósito: aquele só casa `*.spec.mjs`, então o e2e que bloqueia PR nunca roda
 * isto. Uso: `npx playwright test -c e2e/capture.config.mjs`.
 */
export default defineConfig({
  testDir: '.',
  testMatch: /capture-screens\.mjs/,
  timeout: 180_000,
  expect: { timeout: 15_000 },
  retries: 0,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    headless: true,
  },
});
