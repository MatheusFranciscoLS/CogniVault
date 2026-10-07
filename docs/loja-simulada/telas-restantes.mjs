// Percorre as telas que ainda não foram refeitas (Favoritos, Histórico, Negócio, Visão geral, Usuários, Feedback,
// Qualidade, Auditoria): abre cada uma, lista os controles, confere erro, estouro horizontal e fonte pequena, e tira
// captura. Serve para decidir o que refazer, cortar ou manter. Uso (de dentro de frontend/): node ../docs/loja-simulada/telas-restantes.mjs [tema]
import { open, check, step, finish, shot } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });

const telas = [
  { menu: 'Mais', item: 'Favoritos', slug: 'favoritos' },
  { menu: 'Mais', item: 'Histórico', slug: 'historico' },
  { menu: 'Administração', item: 'Negócio', slug: 'negocio' },
  { menu: 'Administração', item: 'Visão geral', slug: 'visao-geral' },
  { menu: 'Administração', item: 'Usuários', slug: 'usuarios' },
  { menu: 'Administração', item: 'Feedback', slug: 'feedback' },
  { menu: 'Administração', item: 'Qualidade', slug: 'qualidade' },
  { menu: 'Administração', item: 'Auditoria', slug: 'auditoria' },
];

for (const tela of telas) {
  await step(tela.item, async () => {
    await page.getByRole('button', { name: tela.menu, exact: true }).click();
    await page.getByRole('menuitem', { name: tela.item }).click();
    await page.waitForTimeout(3500);
    const main = page.locator('main');
    const texto = (await main.innerText()).replace(/\s+/g, ' ');
    const controles = await main.locator('button, a[href], input, select, textarea').evaluateAll(l => l.filter(e => e.getClientRects().length).length);
    const estouro = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    const pequenos = await main.evaluate(m => {
      const ruins = new Map();
      for (const el of m.querySelectorAll('*')) {
        if (!el.childNodes.length || ![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
        const px = parseFloat(getComputedStyle(el).fontSize);
        if (px < 14) ruins.set(Math.round(px), (ruins.get(Math.round(px)) ?? 0) + 1);
      }
      return [...ruins.entries()].map(([px, n]) => `${px}px×${n}`).join(' ');
    });
    const pendente = /Carregando|Verificando/.test(texto) && !/\d/.test(texto);
    console.log(`── ${tela.item}: ${controles} controles, ${texto.length} caracteres | texto menor que 14px: ${pequenos || 'nenhum'} | rolagem horizontal: ${estouro ? 'SIM' : 'não'}`);
    console.log(`   ${texto.slice(0, 220)}`);
    check(`${tela.item} abre com conteúdo`, texto.length > 60 && !pendente);
    check(`${tela.item} sem rolagem horizontal`, !estouro);
    await shot(page, `${theme}-1366-${tela.slug}`);
  });
}

await finish(browser, errors);
