// Utilitários dos roteiros de tela da LOJA SIMULADA. Regra do dono: toda tela aberta é testada em TODO o conteúdo.
// Cada roteiro usa `check` (registra e imprime) e `finish` (resumo, código de saída 1 se algo falhou).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

export const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');
export const BASE = 'http://127.0.0.1:5173';
export const SEARCH = /Código, peça ou modelo|Peça, código ou pergunta/;
export const OUT = path.join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'cvsim', 'shots');
fs.mkdirSync(OUT, { recursive: true });

const results = [];
export const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK    ' : 'FALHOU'} ${name}${detail ? ' — ' + detail : ''}`); };
export const step = async (name, fn) => { try { await fn(); } catch (e) { check(name, false, String(e.message).split('\n')[0]); } };

export async function open({ theme = 'dark', width = 1366, height = 768, login = true, permissions = ['clipboard-read', 'clipboard-write'] } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, permissions });
  await context.addInitScript(t => localStorage.setItem('cognivault-theme', t), theme);
  const page = await context.newPage();
  const errors = [];
  // Diálogos nativos (confirm/alert) são cancelados sozinhos pelo Playwright. Aceita e registra: cada um é
  // uma tela feia do navegador que o balcão vê e que devia ser um diálogo do próprio site.
  page.on('dialog', d => { console.log(`   [diálogo nativo do navegador] ${d.type()}: ${d.message()}`); void d.accept(); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 200)));
  if (login) {
    await page.goto(BASE + '/login');
    await page.getByLabel('E-mail').fill('admin.e2e@cognivault.local');
    await page.locator('#login-password').fill('CogniVault-E2E-2026!');
    await page.getByRole('button', { name: 'Entrar', exact: true }).click();
    await page.waitForURL(/\/dashboard/);
    await clearQuote(page);
  }
  return { browser, page, errors, theme };
}

export const clearQuote = page => page.evaluate(() => fetch('/api/quotes/draft', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [], options: {} }) }));
export const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

export async function finish(browser, errors) {
  check('nenhum erro no console durante todo o roteiro', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const falhas = results.filter(r => !r.ok);
  console.log(`\n${results.length - falhas.length}/${results.length} verificações passaram.`);
  process.exit(falhas.length ? 1 : 0);
}
