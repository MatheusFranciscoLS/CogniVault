// Situações reais de balcão na LOJA SIMULADA: o que o atendente recebe para cada coisa que o cliente diz.
// Não mede beleza; mede se a peça certa aparece, em que posição, com preço, e quanto tempo leva.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/cenarios.mjs
import { createRequire } from 'node:module';
// O Playwright é procurado a partir da pasta ONDE O COMANDO RODA (frontend/), não ao lado deste arquivo.
const { chromium } = createRequire(process.cwd() + '/package.json')('@playwright/test');

const BASE = 'http://127.0.0.1:5173';
const SEARCH = /Código, peça ou modelo|Peça, código ou pergunta/;

// [o que o cliente diz, o que deveria aparecer (trecho do nome ou código) para dizermos "achou"]
const CENARIOS = [
  ['vela de ignição', 'VELA DE IGNICAO'],
  ['vela', 'VELA'],
  ['filtro de ar da 143RII', 'FILTRO DE AR'],
  ['carburador 143RII', 'CARBURADOR'],
  ['587 10 67-01', '587106701'],
  ['58710', '587106701'],
  ['carburadro 143rii', 'CARBURADOR'],          // erro de digitação
  ['junta do carburador', 'JUNTA'],
  ['lâmina roçadeira', 'LAMINA'],
  ['lamina rocadeira', 'LAMINA'],                // sem acento
  ['corrente motosserra 18 polegadas', 'CORRENTE'],
  ['fio de nylon', 'FIO'],
  ['bomba primer', 'PRIMER'],
  ['pistão 365', 'PISTAO'],
  ['kit de reparo carburador', 'KIT'],
  ['óleo 2 tempos', 'OLEO'],
  ['zzzz inexistente', null],
];

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
await page.goto(BASE + '/login');
await page.getByLabel('E-mail').fill('admin.e2e@cognivault.local');
await page.locator('#login-password').fill('CogniVault-E2E-2026!');
await page.getByRole('button', { name: 'Entrar', exact: true }).click();
await page.waitForURL(/\/atendimento/);
await page.evaluate(() => fetch('/api/quotes/draft', { method: 'PUT', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [], options: {} }) }));
await page.reload();

const linhas = [];
for (const [fala, esperado] of CENARIOS) {
  const t0 = Date.now();
  await page.getByPlaceholder(SEARCH).fill(fala);
  await page.getByRole('button', { name: 'Buscar' }).click();
  // espera estabilizar: some o "Buscando…" do botão
  await page.getByRole('button', { name: 'Buscar', exact: true }).waitFor({ timeout: 20000 }).catch(() => undefined);
  await page.waitForTimeout(1200);
  const ms = Date.now() - t0;

  const rows = await page.evaluate(() => [...document.querySelectorAll('section[aria-label="Resultados"] article')].map(article => {
    const code = article.querySelector('button[aria-label^="Copiar código"]')?.getAttribute('aria-label')?.replace('Copiar código ', '') ?? '';
    const name = article.querySelector('span.truncate')?.textContent?.trim() ?? article.textContent?.slice(0, 60) ?? '';
    const price = [...article.querySelectorAll('span')].map(s => s.textContent ?? '').find(t => /^R\$\s?[\d.]+,\d{2}$/.test(t.trim())) ?? '(sem preço)';
    return { code, name, price: price.trim() };
  }));
  const posicao = esperado ? rows.findIndex(r => (r.name + ' ' + r.code).toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').includes(esperado)) + 1 : 0;
  linhas.push({ fala, ms, total: rows.length, posicao, primeiros: rows.slice(0, 3).map(r => `${r.code} ${r.name} ${r.price}`) });
}

for (const l of linhas) {
  const veredito = l.posicao === 0 ? (l.total === 0 ? 'NADA' : 'NÃO ACHOU') : l.posicao === 1 ? 'ok (1º)' : `ok (${l.posicao}º)`;
  console.log(`${JSON.stringify(l.fala).padEnd(40)} ${String(l.ms).padStart(5)}ms  ${String(l.total).padStart(3)} linhas  ${veredito}`);
  for (const p of l.primeiros) console.log('      ' + p);
}
await browser.close();
