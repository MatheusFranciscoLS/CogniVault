// Age como o balcão na LOJA SIMULADA (http://127.0.0.1:5173, banco local) e tira prints.
// Uso: node drive.mjs [tema=dark|light|both] [largura=1366] [altura=768]
import { chromium } from '@playwright/test';
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
  const shot = async name => { await page.waitForTimeout(500); await page.screenshot({ path: path.join(OUT, `${theme}-${W}-${name}.png`) }); };
  const step = async (name, fn) => { try { await fn(); } catch (e) { console.log(`[${theme}] ${name} FALHOU: ${String(e.message).split('\n')[0]}`); } };

  await step('login', async () => {
    await page.goto(BASE + '/login');
    await page.getByLabel('E-mail').fill('admin.e2e@cognivault.local');
    await page.locator('#login-password').fill('CogniVault-E2E-2026!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL(/\/dashboard/);
    await page.getByPlaceholder(SEARCH).waitFor();
    await page.evaluate(() => fetch('/api/quotes/draft', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [], options: {} }) }));
    await page.reload();
    await page.getByPlaceholder(SEARCH).waitFor();
  });
  await shot('01-vazio');

  const buscar = async termo => {
    await page.getByPlaceholder(SEARCH).fill(termo);
    await page.getByRole('button', { name: 'Buscar' }).click();
    await page.waitForTimeout(2500);
  };

  await step('descrição', async () => { await buscar('vela de ignição'); });
  await shot('02-vela');
  await step('modelo', async () => { await buscar('filtro de ar 143RII'); });
  await shot('03-filtro-143rii');
  await step('código', async () => { await buscar('587106701'); });
  await shot('04-codigo');

  await step('gaveta', async () => {
    await page.getByRole('button', { name: /Abrir detalhes de/ }).first().click();
    await page.getByRole('dialog').waitFor();
    await page.waitForTimeout(1500);
  });
  await shot('05-gaveta');
  await step('fechar', async () => { await page.getByRole('button', { name: 'Fechar', exact: true }).click(); });

  if (errors.length) console.log(`[${theme}] erros no console (${errors.length}):\n  ` + [...new Set(errors)].slice(0, 6).join('\n  '));
  await context.close();
}
await browser.close();
console.log('prints em', OUT);
