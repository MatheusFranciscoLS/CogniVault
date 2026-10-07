// Monta um orçamento na LOJA SIMULADA como o balcão e tira prints da gaveta de orçamento.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/quote.mjs [tema=dark|light|both] [largura] [altura]
import { createRequire } from 'node:module';
// O Playwright é procurado a partir da pasta ONDE O COMANDO RODA (frontend/), não ao lado deste arquivo.
const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5173';
const OUT = path.join(process.env.LOCALAPPDATA ?? import.meta.dirname, 'Temp', 'cvsim', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const themes = (process.argv[2] ?? 'both') === 'both' ? ['dark', 'light'] : [process.argv[2]];
const W = Number(process.argv[3] ?? 1366);
const H = Number(process.argv[4] ?? 768);
const SEARCH = /Código, peça ou modelo|Peça, código ou pergunta/;

const browser = await chromium.launch();
for (const theme of themes) {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  await context.addInitScript(t => localStorage.setItem('cognivault-theme', t), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)));
  const shot = async name => { await page.waitForTimeout(600); await page.screenshot({ path: path.join(OUT, `${theme}-${W}-${name}.png`) }); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.log(`[${theme}] ${name} FALHOU: ${String(e.message).split('\n')[0]}`); } };

  await step('login', async () => {
    await page.goto(BASE + '/login');
    await page.getByLabel('E-mail').fill('admin.e2e@cognivault.local');
    await page.locator('#login-password').fill('CogniVault-E2E-2026!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL(/\/dashboard/);
    await page.evaluate(() => fetch('/api/quotes/draft', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [], options: {} }) }));
    await page.reload();
    await page.getByPlaceholder(SEARCH).waitFor();
  });

  const buscarEAdicionar = async termo => {
    await page.getByPlaceholder(SEARCH).fill(termo);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: /\+ Orçamento/ }).first().click();
  };
  await step('adicionar 1', async () => { await buscarEAdicionar('587106701'); });
  await step('adicionar 2', async () => { await buscarEAdicionar('vela de ignição'); });
  await step('adicionar 3', async () => { await buscarEAdicionar('filtro de ar 143RII'); });

  await step('abrir gaveta', async () => {
    await page.getByRole('button', { name: 'Revisar orçamento' }).click();
    await page.waitForTimeout(1200);
  });
  await shot('10-orcamento-gaveta');

  await step('rolar gaveta', async () => {
    await page.evaluate(() => { const d = document.querySelector('[role="dialog"]'); if (d) { const s = [...d.querySelectorAll('*')].find(e => e.scrollHeight > e.clientHeight + 40 && getComputedStyle(e).overflowY !== 'visible'); if (s) s.scrollTop = s.scrollHeight; } });
  });
  await shot('11-orcamento-gaveta-fim');
  await step('fechar', async () => { await page.keyboard.press('Escape'); });

  await step('orçamentos salvos', async () => { await page.goto(BASE + '/dashboard?tab=quotes'); await page.waitForTimeout(1500); });
  await shot('12-orcamentos-lista');

  if (errors.length) console.log(`[${theme}] erros no console (${errors.length}):\n  ` + [...new Set(errors)].slice(0, 6).join('\n  '));
  await context.close();
}
await browser.close();
console.log('prints em', OUT);
