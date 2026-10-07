// Tela CATÁLOGOS inteira: contagem, busca, categoria, "Ver peças", "Abrir vista explodida", "Gerenciar biblioteca" e a busca do cabeçalho.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/catalogos-completo.mjs [tema]
import { open, check, step, finish, shot, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });
const abrirCatalogos = async () => {
  await page.getByRole('button', { name: 'Catálogos', exact: true }).click();
  await page.getByText(/\d+ catálogos?/).first().waitFor({ timeout: 15000 });
  await page.waitForTimeout(500);
};
const contagem = async () => Number(((await page.getByText(/^\d+ catálogos?$/).first().innerText()).match(/\d+/) ?? ['0'])[0]);
const linhas = () => page.getByRole('button', { name: 'Ver peças' });
await abrirCatalogos();
const total = await contagem();

await step('cabeçalho', async () => {
  check('mostra quantos catálogos há', total > 0, `${total}`);
  check('uma linha por catálogo', (await linhas().count()) === total, `${await linhas().count()} linhas`);
  const texto = await page.locator('main').innerText();
  check('colunas Modelo e Categoria', texto.includes('Modelo') && texto.includes('Categoria'));
  check('cada linha mostra arquivo e PNC', /\.pdf/.test(texto) && /PNC/.test(texto));
  await shot(page, `${theme}-1366-catalogos`);
});

await step('busca', async () => {
  const campo = page.getByPlaceholder(/Modelo, arquivo ou PNC|Buscar catálogo/);
  await campo.fill('143');
  await page.waitForTimeout(500);
  const n = await linhas().count();
  check('buscar "143" reduz a lista e o contador acompanha', n > 0 && n < total && (await contagem()) === n, `${total} → ${n}`);
  await campo.fill('967332904');
  await page.waitForTimeout(500);
  check('buscar por PNC acha o catálogo da 143RII', (await page.locator('main').innerText()).includes('143RII'));
  await campo.fill('zzzqqq');
  await page.waitForTimeout(500);
  const vazio = await page.locator('main').innerText();
  check('busca sem resultado avisa', (await linhas().count()) === 0 && /nenhum|não encontr/i.test(vazio), vazio.replace(/\s+/g, ' ').slice(0, 100));
  await campo.fill('');
  await page.waitForTimeout(400);
  check('limpar a busca devolve todos', (await contagem()) === total);
});

await step('categoria', async () => {
  const select = page.getByLabel('Filtrar por categoria');
  const opcoes = await select.locator('option').allInnerTexts();
  console.log(`   categorias: ${opcoes.join(' | ')}`);
  check('há categorias', opcoes.length >= 2);
  await select.selectOption({ index: 1 });
  await page.waitForTimeout(500);
  const n = await linhas().count();
  check('escolher categoria reduz a lista', n > 0 && n < total, `${total} → ${n} (${opcoes[1]})`);
  const linhasTexto = await linhas().evaluateAll(botoes => botoes.map(b => { let e = b; while (e.parentElement && !/\.pdf/i.test(e.innerText)) e = e.parentElement; return e.innerText; }));
  check('toda linha mostrada é da categoria escolhida', linhasTexto.length > 0 && linhasTexto.every(t => t.includes(opcoes[1])), `${linhasTexto.length} linhas, categoria ${opcoes[1]}`);
  await select.selectOption({ index: 0 });
  await page.waitForTimeout(400);
  check('"Todas as categorias" volta tudo', (await contagem()) === total);
});

await step('Ver peças', async () => {
  const campo = page.getByPlaceholder(/Modelo, arquivo ou PNC|Buscar catálogo/);
  await campo.fill('143RII');
  await page.waitForTimeout(400);
  await linhas().first().click();
  await page.waitForTimeout(2500);
  check('"Ver peças" leva ao Atendimento já com o modelo pesquisado', /q=143RII/i.test(page.url()) && (await page.getByPlaceholder(SEARCH).inputValue()) === '143RII', page.url().replace(/^.*\/dashboard/, ''));
  check('e mostra peças daquele modelo', (await page.locator('article').count()) > 0);
});

await step('Abrir vista explodida', async () => {
  await abrirCatalogos();
  const campo = page.getByPlaceholder(/Modelo, arquivo ou PNC|Buscar catálogo/);
  await campo.fill('143RII');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Abrir vista explodida' }).first().click();
  await page.waitForTimeout(3000);
  const painel = (await page.locator('iframe').count()) > 0 || (await page.getByRole('dialog').count()) > 0;
  const aviso = await page.getByText(/armazenamento do catálogo está temporariamente indisponível/).count();
  // Sem armazenamento de PDF na simulação (502): o que importa é abrir o painel ou avisar, nunca ficar mudo.
  check('abre o painel da vista OU avisa que o armazenamento está fora', painel || aviso > 0, `painel: ${painel}, aviso: ${aviso}`);
  await shot(page, `${theme}-1366-catalogos-vista`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Esc fecha o painel', (await page.locator('iframe').count()) === 0);
  errors.splice(0, errors.length, ...errors.filter(e => !/502/.test(e)));
});

await step('busca do cabeçalho (Ctrl K)', async () => {
  await abrirCatalogos();
  const campo = page.getByPlaceholder(/Buscar peça ou código/).first();
  check('o cabeçalho tem a busca nesta tela', (await campo.count()) === 1);
  await page.locator('body').click({ position: { x: 5, y: 500 } });
  await page.keyboard.press('Control+k');
  check('Ctrl K foca a busca do cabeçalho', await campo.evaluate(el => el === document.activeElement));
  await campo.fill('587106701');
  await campo.press('Enter');
  await page.waitForTimeout(2500);
  check('Enter leva ao Atendimento com a busca feita', (await page.getByRole('button', { name: 'Copiar código 587106701' }).count()) >= 1);
});

await step('Gerenciar biblioteca', async () => {
  await abrirCatalogos();
  await page.getByRole('button', { name: 'Gerenciar biblioteca' }).click();
  await page.waitForTimeout(2500);
  const texto = await page.locator('main').innerText();
  check('abre a administração da biblioteca', texto.length > 200, texto.replace(/\s+/g, ' ').slice(0, 100));
  await shot(page, `${theme}-1366-catalogos-biblioteca`);
});

await finish(browser, errors);
