// Faz perguntas ao cadastro de preços da LOJA SIMULADA, como o balcão. Uso: node ask.mjs "pergunta 1" "pergunta 2" ...
import { createRequire } from 'node:module';
// O Playwright é procurado a partir da pasta ONDE O COMANDO RODA (frontend/), não ao lado deste arquivo.
const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');
const queries = process.argv.slice(2);
const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();
await page.goto('http://127.0.0.1:5173/login');
await page.getByLabel('E-mail').fill('admin.e2e@cognivault.local');
await page.locator('#login-password').fill('CogniVault-E2E-2026!');
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForURL(/atendimento/);
for (const q of queries) {
  const r = await page.evaluate(async q => {
    const x = await fetch('/api/master-parts/search?q=' + encodeURIComponent(q), { credentials: 'include' });
    const j = await x.json();
    return { n: (j.parts || []).length, top: (j.parts || []).slice(0, 2).map(a => `${a.partNumber} ${a.name}`) };
  }, q);
  console.log(JSON.stringify(q).padEnd(28), '→', String(r.n).padStart(3), r.top.join(' | '));
}
await browser.close();
