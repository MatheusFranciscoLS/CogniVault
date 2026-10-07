// Abre o painel da máquina (vista explodida oficial) na LOJA SIMULADA e tira prints.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/maquina.mjs [PNC=967332901] [tema=both] [largura=1366] [altura=768]
import { createRequire } from 'node:module';
const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:5173';
const OUT = path.join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'cvsim', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const pnc = process.argv[2] ?? '967332901';
const themes = (process.argv[3] ?? 'both') === 'both' ? ['dark', 'light'] : [process.argv[3]];
const W = Number(process.argv[4] ?? 1366);
const H = Number(process.argv[5] ?? 768);

const browser = await chromium.launch();
for (const theme of themes) {
  const context = await browser.newContext({ viewport: { width: W, height: H } });
  await context.addInitScript(t => localStorage.setItem('cognivault-theme', t), theme);
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 160)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 160)));
  await page.goto(BASE + '/login');
  await page.getByLabel('E-mail').fill('admin.e2e@cognivault.local');
  await page.locator('#login-password').fill('CogniVault-E2E-2026!');
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await page.waitForURL(/\/dashboard/);
  await page.goto(`${BASE}/dashboard?tab=machines&pnc=${pnc}`);
  await page.getByRole('dialog').first().waitFor({ timeout: 20000 }).catch(() => console.log(`[${theme}] sem diálogo`));
  await page.waitForTimeout(6000);
  await page.screenshot({ path: path.join(OUT, `${theme}-${W}-maquina-topo.png`) });
  const dialog = page.getByRole('dialog').first();
  await dialog.evaluate(el => { const s = el.querySelector('.overflow-y-auto'); if (s) s.scrollTop = 900; });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${theme}-${W}-maquina-meio.png`) });
  console.log(`[${theme}] erros: ${errors.length ? errors.join(' | ') : 'nenhum'}`);
  await context.close();
}
await browser.close();
console.log('prints em', OUT);
