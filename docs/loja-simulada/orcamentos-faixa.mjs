// ORÇAMENTOS no padrão de faixa (direção B do redesenho, 2026-10-10): o formulário de busca (texto, tipo, De, Até, Buscar/Limpar) mora DENTRO da faixa,
// com campos brancos nos dois temas. As funções (filtrar, retomar, excluir, copiar) têm o roteiro `orcamentos-completo.mjs`. 1366×768, dois temas.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/orcamentos-faixa.mjs [tema]
import { open, check, step, finish, shot, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const textoDaTela = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

await page.goto(BASE + '/orcamentos');
const campo = page.getByPlaceholder(/Ex\.: Sr\. Carlos/);
await campo.waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);

await step('A faixa tem o título, a contagem e o formulário de busca', async () => {
  check('há um único h1 "Orçamentos"', (await page.getByRole('heading', { level: 1 }).allInnerTexts()).join('|') === 'Orçamentos');
  check('a contagem aparece no cabeçalho ("N orçamento(s) arquivado(s)")', /\d+ orçamentos? arquivados?/.test(await textoDaTela()));
  for (const rotulo of ['Cliente, OS, telefone, código ou modelo', 'Tipo', 'De', 'Até']) check(`o campo "${rotulo}" está na tela`, (await textoDaTela()).includes(rotulo));
  check('o botão Buscar está na tela', await page.getByRole('button', { name: 'Buscar' }).isVisible());
  check('Limpar só aparece quando há filtro', await page.getByRole('button', { name: 'Limpar' }).count() === 0);
  const caixa = await campo.boundingBox();
  check('o campo de busca está dentro da faixa (antes de 260 px)', caixa.y < 260, String(caixa.y));
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('sem rolagem horizontal em 1366', largura.doc <= largura.win, JSON.stringify(largura));
  check('a tabela começa antes de 340 px', (await page.getByRole('table').boundingBox()).y < 340, String((await page.getByRole('table').boundingBox()).y));
  await shot(page, `${theme}-1366-orcamentos-faixa`);
});

await step('Os campos sobre o marinho são brancos nos dois temas', async () => {
  const fundos = await page.evaluate(() => ['quote-filter', 'quote-from', 'quote-to'].map(id => getComputedStyle(document.getElementById(id)).backgroundColor));
  check('texto, De e Até têm fundo branco', fundos.every(cor => cor === 'rgb(255, 255, 255)'), fundos.join(' | '));
  const cores = await page.evaluate(() => ['quote-filter', 'quote-from', 'quote-to'].map(id => getComputedStyle(document.getElementById(id)).color));
  check('o texto digitado é escuro (#1b2234)', cores.every(cor => cor === 'rgb(27, 34, 52)'), cores.join(' | '));
});

await step('Tipo: o botão marcado fica branco e o estado vai para a leitura de tela', async () => {
  const grupo = page.getByRole('group', { name: 'Tipo' });
  const todos = grupo.getByRole('button', { name: 'Todos' });
  const pecas = grupo.getByRole('button', { name: 'Peças' });
  check('Todos começa marcado', (await todos.getAttribute('aria-pressed')) === 'true' && (await pecas.getAttribute('aria-pressed')) === 'false');
  await pecas.click();
  await page.waitForTimeout(500);
  check('clicar em Peças marca Peças e solta Todos', (await pecas.getAttribute('aria-pressed')) === 'true' && (await todos.getAttribute('aria-pressed')) === 'false');
  check('Limpar aparece com o filtro de tipo', await page.getByRole('button', { name: 'Limpar' }).isVisible());
  check('o botão marcado tem fundo branco', (await pecas.evaluate(el => getComputedStyle(el).backgroundColor)) === 'rgb(255, 255, 255)');
  await shot(page, `${theme}-1366-orcamentos-faixa-filtrado`);
  await page.getByRole('button', { name: 'Limpar' }).click();
  await page.waitForTimeout(400);
  check('Limpar volta para Todos e some', (await todos.getAttribute('aria-pressed')) === 'true' && await page.getByRole('button', { name: 'Limpar' }).count() === 0);
});

await step('Teclado: Enter no campo busca; sem resultado há saída', async () => {
  await campo.fill('zzz-ninguem-assim-9999');
  await campo.press('Enter');
  await page.waitForTimeout(1200);
  check('Enter busca e mostra "nenhum" com saída para limpar', /Nenhum orçamento|nenhum/i.test(await textoDaTela()) && await page.getByRole('button', { name: 'Limpar' }).isVisible());
  await page.getByRole('button', { name: 'Limpar' }).click();
  await page.waitForTimeout(400);
  check('Limpar esvazia o campo', (await campo.inputValue()) === '');
});

await finish(browser, errors);
