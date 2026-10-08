// Biblioteca de catálogos (Gerenciar biblioteca): cabeçalho, importação sob demanda, fichas de seção, tabela, menu "⋯" de cada linha.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/biblioteca-completo.mjs [tema]
import { open, check, step, finish, BASE, SEARCH, confirmar } from './_t.mjs';

const theme = process.argv[2] ?? 'light';
const { browser, page, errors } = await open({ theme });

await step('abre a biblioteca', async () => {
  await page.goto(BASE + '/catalogos');
  await page.getByRole('button', { name: 'Gerenciar biblioteca' }).click();
  await page.getByRole('heading', { name: 'Biblioteca de catálogos', level: 1 }).waitFor({ timeout: 15000 });
  check('título e contagem no cabeçalho', /\d+ catálogos?/.test(await page.locator('main').innerText()));
  check('a tabela é a visão inicial', await page.locator('table').count() > 0);
});

await step('importação sob demanda', async () => {
  const caixa = page.getByText('Clique, arraste os PDFs ou cole com Ctrl+V');
  check('a importação começa fechada', !(await caixa.isVisible()));
  await page.getByRole('button', { name: 'Importar PDFs' }).click();
  check('"Importar PDFs" abre a caixa de arquivos', await caixa.isVisible());
  await page.getByRole('button', { name: 'Fechar importação' }).click();
  check('"Fechar importação" esconde de novo', !(await caixa.isVisible()));
});

await step('fichas de seção', async () => {
  const grupo = page.getByRole('group', { name: 'Seção da biblioteca' });
  const fichas = grupo.getByRole('button');
  check('há a ficha "Todos" e ao menos uma seção', (await fichas.count()) >= 2, `${await fichas.count()}`);
  const todos = await page.locator('table tbody tr').count();
  await fichas.nth(1).click();
  await page.waitForTimeout(400);
  const filtrado = await page.locator('table tbody tr').count();
  check('escolher uma seção filtra a tabela', filtrado <= todos, `${todos} → ${filtrado}`);
  await fichas.first().click();
});

await step('menu de ações da linha', async () => {
  const linha = page.locator('table tbody tr').first();
  await linha.getByRole('button', { name: /Mais ações de/ }).click();
  for (const nome of ['Baixar PDF', 'Reextrair peças', 'Arquivar', 'Excluir PDF']) {
    check(`o menu tem "${nome}"`, await page.getByRole('menuitem', { name: nome }).count() === 1);
  }
  await page.getByRole('menuitem', { name: 'Arquivar' }).click();
  const perguntou = await confirmar(page, 'Cancelar', { obrigatorio: false });
  check('arquivar pergunta antes (diálogo do site)', perguntou);
  await page.keyboard.press('Escape');
});

await step('"Ver peças" leva ao Atendimento', async () => {
  await page.locator('table tbody tr').first().getByRole('button', { name: 'Ver peças' }).click();
  await page.getByPlaceholder(SEARCH).waitFor({ timeout: 15000 });
  check('abre o Atendimento com a busca preenchida', (await page.getByPlaceholder(SEARCH).inputValue()).length > 0 && new URL(page.url()).pathname === '/atendimento', page.url().replace(BASE, ''));
});

await finish(browser, errors);
