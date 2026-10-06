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
    // Sem isto, clique e preenchimento esperam até o teto de 180 s do teste por
    // um elemento que não existe — e o teste morre sem tirar os prints seguintes.
    // Foi o que aconteceu na primeira execução. Falhar rápido deixa o passo
    // cair no try/catch e a captura seguir.
    actionTimeout: 8_000,
    navigationTimeout: 30_000,
  },
});
