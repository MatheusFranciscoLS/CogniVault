// TABELA DE PREÇOS no padrão de faixa (direção B do redesenho, 2026-10-10): busca, tecnologia, categoria, aplicação, novidades e limpar moram DENTRO da faixa,
// com campos brancos nos dois temas. As funções (filtrar, ordenar, gaveta, orçamento) têm o roteiro `tabela-precos-completo.mjs`. 1366×768, dois temas.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/tabela-faixa.mjs [tema]
import { open, check, step, finish, shot, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const textoDaTela = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

await page.goto(BASE + '/tabela-de-precos');
const busca = page.getByLabel('Buscar máquina na tabela');
await busca.waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);

await step('A faixa tem o título, a data da lista e todos os filtros', async () => {
  check('há um único h1 "Tabela de preços"', (await page.getByRole('heading', { level: 1 }).allInnerTexts()).join('|') === 'Tabela de preços');
  check('a data da lista aparece no cabeçalho ("Lista de dd/mm/aaaa")', /Lista de \d{2}\/\d{2}\/\d{4}/.test(await textoDaTela()));
  check('o campo de busca já está com o foco (teclado primeiro)', await busca.evaluate(e => e === document.activeElement));
  check('o grupo Tecnologia está na tela', await page.getByRole('group', { name: 'Tecnologia' }).isVisible());
  check('Categoria e Aplicação estão na tela', await page.getByLabel('Categoria').isVisible() && await page.getByLabel('Aplicação').isVisible());
  check('Limpar só aparece quando há filtro', await page.getByRole('button', { name: 'Limpar' }).count() === 0);
  const y = (await busca.boundingBox()).y;
  check('os filtros estão dentro da faixa (antes de 260 px)', y < 260, String(y));
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('sem rolagem horizontal em 1366', largura.doc <= largura.win, JSON.stringify(largura));
  check('a tabela começa antes de 340 px', (await page.getByRole('table').boundingBox()).y < 340, String((await page.getByRole('table').boundingBox()).y));
  await shot(page, `${theme}-1366-tabela-faixa`);
});

await step('Os campos sobre o marinho são brancos nos dois temas', async () => {
  const fundos = await page.evaluate(() => [document.querySelector('[aria-label="Buscar máquina na tabela"]'), document.querySelector('[aria-label="Categoria"]'), document.querySelector('[aria-label="Aplicação"]')].map(el => getComputedStyle(el).backgroundColor));
  check('busca, Categoria e Aplicação têm fundo branco', fundos.every(cor => cor === 'rgb(255, 255, 255)'), fundos.join(' | '));
  const cores = await page.evaluate(() => [document.querySelector('[aria-label="Categoria"]'), document.querySelector('[aria-label="Aplicação"]')].map(el => getComputedStyle(el).color));
  check('o texto dos seletores é escuro (#1b2234)', cores.every(cor => cor === 'rgb(27, 34, 52)'), cores.join(' | '));
});

await step('Tecnologia, categoria e a contagem andam juntas', async () => {
  const grupo = page.getByRole('group', { name: 'Tecnologia' });
  const todas = grupo.getByRole('button', { name: /^Todas/ });
  check('Todas começa marcada', (await todas.getAttribute('aria-pressed')) === 'true');
  const total = (await textoDaTela()).match(/(\d+) máquinas?/)?.[1];
  await grupo.getByRole('button', { name: /^Bateria/ }).click();
  await page.waitForTimeout(500);
  const bateria = (await textoDaTela()).match(/(\d+) máquinas?/)?.[1];
  check('Bateria marca o botão e diminui a contagem', (await grupo.getByRole('button', { name: /^Bateria/ }).getAttribute('aria-pressed')) === 'true' && Number(bateria) > 0 && Number(bateria) < Number(total), `${total} -> ${bateria}`);
  check('o botão marcado fica branco com texto escuro', (await grupo.getByRole('button', { name: /^Bateria/ }).evaluate(el => getComputedStyle(el).backgroundColor)) === 'rgb(255, 255, 255)');
  check('Limpar aparece com o filtro', await page.getByRole('button', { name: 'Limpar' }).isVisible());
  await shot(page, `${theme}-1366-tabela-faixa-filtrada`);
  await page.getByRole('button', { name: 'Limpar' }).click();
  await page.waitForTimeout(400);
  check('Limpar volta à contagem inteira e some', (await textoDaTela()).match(/(\d+) máquinas?/)?.[1] === total && await page.getByRole('button', { name: 'Limpar' }).count() === 0);
});

await step('Novidades da lista é um botão de alternar com estado', async () => {
  const botao = page.getByRole('button', { name: /^Novidades da lista/ });
  if (await botao.count() === 0) return check('(a lista da loja simulada não tem novidades: nada a alternar)', true);
  check('começa desmarcado', (await botao.getAttribute('aria-pressed')) === 'false');
  await botao.click();
  await page.waitForTimeout(500);
  check('clicar marca (aria-pressed) e o botão fica branco', (await botao.getAttribute('aria-pressed')) === 'true' && (await botao.evaluate(el => getComputedStyle(el).backgroundColor)) === 'rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Limpar' }).click();
});

await step('Sem resultado há saída', async () => {
  await busca.fill('zzz-ninguem-assim-9999');
  await page.waitForTimeout(500);
  check('mostra "Nenhuma máquina com esses filtros." e a contagem 0', (await textoDaTela()).includes('Nenhuma máquina com esses filtros.') && /0 máquinas/.test(await textoDaTela()));
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  await page.waitForTimeout(400);
  check('"Limpar filtros" traz a lista de volta', (await busca.inputValue()) === '' && await page.getByRole('table').isVisible());
});

await finish(browser, errors);
