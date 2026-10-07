// Utilitários dos roteiros de tela da LOJA SIMULADA. Regra do dono: toda tela aberta é testada em TODO o conteúdo.
// Cada roteiro usa `check` (registra e imprime) e `finish` (resumo, código de saída 1 se algo falhou).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');
export const BASE = 'http://127.0.0.1:5173';
export const SEARCH = /Código, peça ou modelo|Peça, código ou pergunta/;
export const OUT = path.join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'cvsim', 'shots');
fs.mkdirSync(OUT, { recursive: true });

/** SQL na LOJA SIMULADA (porta 54330, senha de mentira). Nunca aponta para outro lugar. */
export function sqlSim(sql) {
  return execFileSync('C:/Program Files/PostgreSQL/18/bin/psql.exe', ['-h', '127.0.0.1', '-p', '54330', '-U', 'postgres', '-t', '-A', '-c', sql], { env: { ...process.env, PGPASSWORD: 'sim' }, encoding: 'utf8' }).trim();
}

const results = [];
let paginaAtual = null;
export const nativeDialogs = [];
export const check = (name, ok, detail = '') => { results.push({ name, ok }); console.log(`${ok ? 'OK    ' : 'FALHOU'} ${name}${detail ? ' — ' + detail : ''}`); };
// Mostra a 1ª linha do erro e, quando o Playwright diz, QUAL elemento ele esperava (`waiting for ...`).
export const step = async (name, fn) => {
  try { await fn(); } catch (e) {
    // Captura da tela no momento da falha: mostra o que o atendente veria (e o que o roteiro não esperava).
    if (paginaAtual) await paginaAtual.screenshot({ path: path.join(OUT, `falha-${name.replace(/[^a-z0-9]+/gi, '-').slice(0, 50)}.png`) }).catch(() => {});
    const linhas = String(e.message).split('\n');
    const esperava = linhas.find(l => /waiting for/.test(l));
    check(name, false, [linhas[0], esperava ? esperava.replace(/\x1b\[[0-9;]*m/g, '').trim().slice(0, 160) : ''].filter(Boolean).join(' | '));
  }
};

export async function open({ theme = 'dark', width = 1366, height = 768, login = true, permissions = ['clipboard-read', 'clipboard-write'] } = {}) {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width, height }, permissions });
  await context.addInitScript(t => localStorage.setItem('cognivault-theme', t), theme);
  const page = await context.newPage();
  paginaAtual = page;
  const errors = [];
  // Diálogos nativos (confirm/alert) são cancelados sozinhos pelo Playwright. Aceita e registra: cada um é
  // uma tela feia do navegador que o balcão vê e que devia ser um diálogo do próprio site.
  page.on('dialog', d => { nativeDialogs.push(`${d.type()}: ${d.message()}`); console.log(`   [diálogo nativo do navegador] ${d.type()}: ${d.message()}`); void d.accept(); });
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e).slice(0, 200)));
  if (login) {
    // Entra por API, limpa o rascunho e só DEPOIS abre o painel. Entrar pela tela e limpar com o painel aberto não
    // funcionava: ao recarregar, o app grava o estado antigo dele no servidor (flushBeforeUnload) e desfaz a limpeza,
    // deixando itens de uma rodada na outra.
    const cabecalhos = { Origin: BASE };
    const entrada = await page.request.post(BASE + '/api/login', { data: { email: 'admin.e2e@cognivault.local', password: 'CogniVault-E2E-2026!' }, headers: cabecalhos });
    if (!entrada.ok()) throw new Error(`login por API falhou: ${entrada.status()}`);
    const eu = (await (await page.request.get(BASE + '/api/me')).json()).user;
    await page.request.put(BASE + '/api/quotes/draft', { data: { items: [], options: {} }, headers: cabecalhos });
    await context.addInitScript(usuario => {
      localStorage.setItem('cognivault_tenant', usuario.tenantId);
      localStorage.setItem('cognivault_role', usuario.role);
      localStorage.setItem('cognivault_email', usuario.email);
    }, eu);
    await page.goto(BASE + '/dashboard');
    await page.getByPlaceholder(SEARCH).waitFor({ timeout: 20000 });
  }
  return { browser, page, errors, theme };
}

export const clearQuote = page => page.evaluate(() => fetch('/api/quotes/draft', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [], options: {} }) }));
export const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`) });

/** Clica no botão do diálogo de confirmação do SITE (AlertDialog), se ele aparecer. */
export async function confirmar(page, nome, { obrigatorio = true } = {}) {
  const dialogo = page.getByRole('alertdialog');
  try { await dialogo.waitFor({ timeout: obrigatorio ? 5000 : 1200 }); } catch { if (obrigatorio) throw new Error(`o diálogo de confirmação não apareceu (${nome})`); return false; }
  await dialogo.getByRole('button', { name: nome }).click();
  await page.waitForTimeout(400);
  return true;
}

export async function finish(browser, errors) {
  check('nenhum diálogo nativo do navegador apareceu (as confirmações são do próprio site)', nativeDialogs.length === 0, nativeDialogs.join(' | '));
  check('nenhum erro no console durante todo o roteiro', errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
  const falhas = results.filter(r => !r.ok);
  console.log(`\n${results.length - falhas.length}/${results.length} verificações passaram.`);
  process.exit(falhas.length ? 1 : 0);
}
