// Mede o contraste (WCAG AA) de todo texto visível em cada tela, compondo o fundo dos ancestrais.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/contraste-completo.mjs [tema]
import { open, check, step, finish, BASE, SEARCH } from './_t.mjs';

const theme = process.argv[2] ?? 'light';
const { browser, page, errors } = await open({ theme });

const medir = () => page.evaluate(() => {
  const parse = c => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r, g, b, a }; };
  const over = (top, bottom) => ({ r: top.r * top.a + bottom.r * (1 - top.a), g: top.g * top.a + bottom.g * (1 - top.a), b: top.b * top.a + bottom.b * (1 - top.a), a: 1 });
  const lum = ({ r, g, b }) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = el => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) { const bg = parse(getComputedStyle(e).backgroundColor); if (bg && bg.a > 0) { stack.push(bg); if (bg.a >= 1) break; } }
    let base = { r: 255, g: 255, b: 255, a: 1 };
    for (const layer of stack.reverse()) base = over(layer, base);
    return base;
  };
  const bad = [];
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const seen = new Set();
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent.trim();
    const el = n.parentElement;
    if (!text || !el || seen.has(el)) continue;
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0 || rect.bottom < 0 || rect.top > innerHeight) continue;
    if (el.closest('[aria-hidden="true"], .sr-only, script, style, kbd, :disabled, [aria-disabled="true"]')) continue; // kbd sobre o campo branco do cabeçalho: o fundo real é o do campo, não o da barra
    if (el.disabled) continue;
    seen.add(el);
    let fg = parse(style.color);
    if (!fg) continue;
    let opacity = 1;
    for (let e = el; e; e = e.parentElement) opacity *= Number(getComputedStyle(e).opacity);
    const bg = bgOf(el);
    fg = over({ ...fg, a: fg.a * opacity }, bg);
    const l1 = lum(fg), l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = parseFloat(style.fontSize), bold = Number(style.fontWeight) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    if (ratio < (large ? 3 : 4.5)) bad.push(`${ratio.toFixed(2)}:1 "${text.slice(0, 40)}" (${Math.round(size)}px)`);
  }
  return bad;
});

const telas = [
  ['Atendimento vazio', async () => { await page.goto(BASE + '/atendimento'); await page.getByPlaceholder(SEARCH).waitFor(); await page.waitForTimeout(800); }],
  ['Atendimento com resultados e orçamento', async () => {
    const campo = page.getByPlaceholder(SEARCH); await campo.fill('carburador 143RII'); await campo.press('Enter'); await page.waitForTimeout(3500);
    await page.locator('[data-row-add]').first().click(); await page.waitForTimeout(500);
  }],
  ['Catálogos', async () => { await page.goto(BASE + '/catalogos'); await page.waitForTimeout(2000); }],
  ['Orçamentos', async () => { await page.goto(BASE + '/orcamentos'); await page.waitForTimeout(2000); }],
  ['Tabela de preços', async () => { await page.goto(BASE + '/tabela-de-precos'); await page.waitForTimeout(2000); }],
  ['Negócio', async () => { await page.goto(BASE + '/administracao/negocio'); await page.waitForTimeout(2500); }],
  ['Visão geral', async () => { await page.goto(BASE + '/administracao/visao-geral'); await page.waitForTimeout(2500); }],
  ['Usuários', async () => { await page.goto(BASE + '/administracao/usuarios'); await page.waitForTimeout(2000); }],
  ['Qualidade', async () => { await page.goto(BASE + '/administracao/qualidade'); await page.waitForTimeout(5000); }],
];
for (const [nome, ir] of telas) {
  await step(nome, async () => {
    await ir();
    const ruins = await medir();
    check(`${nome}: todo texto passa no contraste AA (${theme})`, ruins.length === 0, ruins.slice(0, 6).join(' | ') + (ruins.length > 6 ? ` … +${ruins.length - 6}` : ''));
  });
}
await finish(browser, errors);
