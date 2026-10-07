// Tira print de uma aba do dashboard na LOJA SIMULADA, nos dois temas.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/tab.mjs <aba> [largura] [altura]
//   ex.: node ../docs/loja-simulada/tab.mjs catalogs      (abas: parts, catalogs, quotes, overview, business, users, quality, audit...)
// Para a tela de login, use a aba especial "login" (sem entrar).
import { createRequire } from 'node:module';
// O Playwright é procurado a partir da pasta ONDE O COMANDO RODA (frontend/), não ao lado deste arquivo.
const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5173';
const OUT = path.join(process.env.LOCALAPPDATA ?? import.meta.dirname, 'Temp', 'cvsim', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const tab = process.argv[2] ?? 'catalogs';
const W = Number(process.argv[3] ?? 1366);
const H = Number(process.argv[4] ?? 768);

const browser = await chromium.launch();
for (const theme of ['dark', 'light']) {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  await context.addInitScript(t => localStorage.setItem('cognivault-theme', t), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)));
  try {
    if (tab === 'login') {
      await page.goto(BASE + '/login');
      await page.getByLabel('E-mail').waitFor();
    } else {
      await page.goto(BASE + '/login');
      await page.getByLabel('E-mail').fill('admin.e2e@cognivault.local');
      await page.locator('#login-password').fill('CogniVault-E2E-2026!');
      await page.getByRole('button', { name: 'Entrar', exact: true }).click();
      await page.waitForURL(/\/dashboard/);
      await page.goto(`${BASE}/dashboard?tab=${tab}`);
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path: path.join(OUT, `${theme}-${W}-aba-${tab}.png`) });
  } catch (e) {
    console.log(`[${theme}] FALHOU: ${String(e.message).split('\n')[0]}`);
  }
  if (errors.length) console.log(`[${theme}] erros no console (${errors.length}):\n  ` + [...new Set(errors)].slice(0, 6).join('\n  '));
  await context.close();
}
await browser.close();
console.log('prints em', OUT);
