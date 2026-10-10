// VARREDURA ESTRUTURAL de todas as telas (2026-10-10): campo/botão sem nome, imagem sem alt, id repetido, h1 diferente de 1, salto de título, alvo < 28 px, texto < 13,5 px,
// rolagem horizontal, erros de console e respostas 4xx/5xx de rede. Não mede contraste (isso é o contraste-completo.mjs). Achado entra no PLANO com a data.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/varredura-telas.mjs [tema]
import { open, BASE, SEARCH } from './_t.mjs';

const theme = process.argv[2] ?? 'light';
const { browser, page } = await open({ theme, width: 1366, height: 768 });

const falhas = [];
page.on('response', r => { const s = r.status(); if (s >= 400 && !/\/api\/auth\/(me|session)/.test(r.url())) falhas.push(`${s} ${r.request().method()} ${new URL(r.url()).pathname}`); });
const avisos = [];
page.on('console', m => { if (['error', 'warning'].includes(m.type())) avisos.push(`${m.type()}: ${m.text().slice(0, 140)}`); });
page.on('pageerror', e => avisos.push('pageerror: ' + String(e).slice(0, 140)));

const telas = [
  ['/atendimento', async () => { await page.getByPlaceholder(SEARCH).waitFor(); }],
  ['/atendimento (resultados)', async () => { const c = page.getByPlaceholder(SEARCH); await c.fill('carburador 143RII'); await c.press('Enter'); await page.locator('[data-row-add]').first().waitFor({ timeout: 30000 }); await page.waitForTimeout(800); }],
  ['/catalogos', async () => { await page.goto(BASE + '/catalogos'); await page.waitForTimeout(2000); }],
  ['/orcamentos', async () => { await page.goto(BASE + '/orcamentos'); await page.waitForTimeout(2000); }],
  ['/conserto', async () => { await page.goto(BASE + '/conserto'); await page.waitForTimeout(2000); }],
  ['/tabela-de-precos', async () => { await page.goto(BASE + '/tabela-de-precos'); await page.waitForTimeout(2000); }],
  ['/administracao/negocio', async () => { await page.goto(BASE + '/administracao/negocio'); await page.waitForTimeout(2500); }],
  ['/administracao/negocio?aba=demanda', async () => { await page.goto(BASE + '/administracao/negocio?aba=demanda'); await page.waitForTimeout(3000); }],
  ['/administracao/negocio?aba=lista', async () => { await page.goto(BASE + '/administracao/negocio?aba=lista'); await page.waitForTimeout(2500); }],
  ['/administracao/visao-geral', async () => { await page.goto(BASE + '/administracao/visao-geral'); await page.waitForTimeout(2500); }],
  ['/administracao/visao-geral?aba=ia', async () => { await page.goto(BASE + '/administracao/visao-geral?aba=ia'); await page.waitForTimeout(3000); }],
  ['/administracao/usuarios', async () => { await page.goto(BASE + '/administracao/usuarios'); await page.waitForTimeout(2000); }],
  ['/administracao/qualidade', async () => { await page.goto(BASE + '/administracao/qualidade'); await page.waitForTimeout(4000); }],
  ['/administracao/qualidade?aba=fila', async () => { await page.goto(BASE + '/administracao/qualidade?aba=fila'); await page.waitForTimeout(3500); }],
  ['/administracao/qualidade?aba=tecnico', async () => { await page.goto(BASE + '/administracao/qualidade?aba=tecnico'); await page.waitForTimeout(3500); }],
];

const medir = () => page.evaluate(() => {
  const vis = el => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && !el.closest('.sr-only, [aria-hidden="true"]'); };
  const nome = el => (el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') && document.getElementById(el.getAttribute('aria-labelledby'))?.textContent || el.innerText || el.getAttribute('title') || el.getAttribute('alt') || '').trim();
  const out = {};
  out.inputsSemNome = [...document.querySelectorAll('input:not([type=hidden]), select, textarea')].filter(vis).filter(el => !(el.labels && el.labels.length) && !nome(el) && !el.getAttribute('placeholder')).map(el => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}[${el.type}]`);
  out.inputsSoPlaceholder = [...document.querySelectorAll('input:not([type=hidden]), textarea')].filter(vis).filter(el => !(el.labels && el.labels.length) && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby') && el.getAttribute('placeholder')).map(el => el.getAttribute('placeholder').slice(0, 30));
  out.botoesSemNome = [...document.querySelectorAll('button, a[href], [role=button]')].filter(vis).filter(el => !nome(el)).map(el => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').slice(0, 2).join('.')}`);
  out.imgSemAlt = [...document.querySelectorAll('img')].filter(vis).filter(el => el.getAttribute('alt') === null).map(el => el.getAttribute('src')?.slice(-40));
  const ids = {}; document.querySelectorAll('[id]').forEach(el => { ids[el.id] = (ids[el.id] || 0) + 1; });
  out.idsRepetidos = Object.entries(ids).filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
  out.tabindexPositivo = [...document.querySelectorAll('[tabindex]')].filter(el => Number(el.getAttribute('tabindex')) > 0).length;
  const hs = [...document.querySelectorAll('h1,h2,h3,h4')].filter(el => !el.closest('[aria-hidden="true"]')).map(el => Number(el.tagName[1]));
  out.h1 = hs.filter(n => n === 1).length;
  out.saltoDeTitulo = hs.some((n, i) => i > 0 && n - hs[i - 1] > 1);
  out.alvosPequenos = [...document.querySelectorAll('button, a[href], select, input[type=checkbox], input[type=radio], [role=tab], [role=button]')].filter(vis).filter(el => { const r = el.getBoundingClientRect(); return (r.height < 28 || r.width < 28) && !(el.tagName === 'A' && el.closest('p, li, td')); }).map(el => `${nome(el).slice(0, 22) || el.tagName.toLowerCase()} ${Math.round(el.getBoundingClientRect().width)}x${Math.round(el.getBoundingClientRect().height)}`);
  out.textoPequeno = (() => { const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); const r = new Set(); for (let n = w.nextNode(); n; n = w.nextNode()) { const el = n.parentElement; if (!n.textContent.trim() || !el || !vis(el)) continue; const px = parseFloat(getComputedStyle(el).fontSize); if (px < 13.5) r.add(`${Math.round(px * 10) / 10}px "${n.textContent.trim().slice(0, 22)}"`); } return [...r].slice(0, 6); })();
  out.rolagemH = document.documentElement.scrollWidth > innerWidth;
  out.semMain = !document.querySelector('main');
  out.semLang = !document.documentElement.lang;
  return out;
});

const resumo = [];
for (const [rota, ir] of telas) {
  const f0 = falhas.length, a0 = avisos.length;
  const t0 = Date.now();
  if (rota.startsWith('/atendimento')) { if (rota === '/atendimento') await page.goto(BASE + '/atendimento'); }
  await ir();
  const m = await medir();
  const problemas = [];
  if (m.inputsSemNome.length) problemas.push(`campo sem nome: ${m.inputsSemNome.join(', ')}`);
  if (m.inputsSoPlaceholder.length) problemas.push(`campo só com placeholder (sem rótulo): ${m.inputsSoPlaceholder.join(' | ')}`);
  if (m.botoesSemNome.length) problemas.push(`botão/link sem nome: ${m.botoesSemNome.join(', ')}`);
  if (m.imgSemAlt.length) problemas.push(`img sem alt: ${m.imgSemAlt.join(', ')}`);
  if (m.idsRepetidos.length) problemas.push(`id repetido: ${m.idsRepetidos.join(', ')}`);
  if (m.tabindexPositivo) problemas.push(`tabindex positivo: ${m.tabindexPositivo}`);
  if (m.h1 !== 1) problemas.push(`h1 = ${m.h1}`);
  if (m.saltoDeTitulo) problemas.push('salto de nível de título');
  if (m.alvosPequenos.length) problemas.push(`alvo < 28px: ${m.alvosPequenos.slice(0, 6).join(' | ')}`);
  if (m.textoPequeno.length) problemas.push(`texto < 13,5px: ${m.textoPequeno.join(' | ')}`);
  if (m.rolagemH) problemas.push('rolagem horizontal');
  if (falhas.length > f0) problemas.push(`rede: ${[...new Set(falhas.slice(f0))].join(', ')}`);
  if (avisos.length > a0) problemas.push(`console: ${[...new Set(avisos.slice(a0))].slice(0, 3).join(' || ')}`);
  resumo.push(`${problemas.length ? '⚠' : '✓'} ${rota} (${Date.now() - t0} ms)${problemas.length ? '\n    - ' + problemas.join('\n    - ') : ''}`);
}
console.log(`\n=== VARREDURA (${theme}) ===\n` + resumo.join('\n'));
await browser.close();
