// ATENDIMENTO no padrão de faixa (direção B do redesenho, 2026-10-10): a busca e a barra de cliente/máquina moram na faixa; o resto (resultados, orçamento ao lado,
// painéis) fica como era. As funções (busca, teclado, orçamento) têm `atendimento-completo.mjs`, `teclado-completo.mjs` e `busca-modelo.mjs`; o tempo, `atendimento-tempo.mjs`.
// 1366×768, dois temas. Uso (de dentro de frontend/): node ../docs/loja-simulada/atendimento-faixa.mjs [tema]
import { open, check, step, finish, shot, BASE, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const textoDaTela = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

await page.goto(BASE + '/atendimento');
const campo = page.getByPlaceholder(SEARCH);
await campo.waitFor({ timeout: 30000 });
await page.waitForTimeout(1200);

await step('A faixa tem a busca grande e o convite da máquina', async () => {
  check('há um único h1 "Atendimento" (para leitor de tela)', (await page.getByRole('heading', { level: 1 }).allInnerTexts()).join('|') === 'Atendimento');
  const caixa = await campo.boundingBox();
  check('o campo de busca está dentro da faixa (antes de 140 px) e é grande (≥ 52 px)', caixa.y < 140 && caixa.height >= 52, `${caixa.y} / ${caixa.height}`);
  check('o campo é branco', (await campo.evaluate(el => getComputedStyle(el).backgroundColor)) === 'rgb(255, 255, 255)');
  check('o placeholder cabe inteiro (o selo Ctrl K não corta o texto)', await campo.evaluate(el => el.scrollWidth <= el.clientWidth + 1), await campo.evaluate(el => `${el.scrollWidth}/${el.clientWidth}`));
  check('o selo Ctrl K aparece com o campo vazio', (await textoDaTela()).includes('Ctrl K'));
  check('o botão Buscar está na tela e Limpar só aparece com texto', await page.getByRole('button', { name: 'Buscar', exact: true }).isVisible() && await page.getByRole('button', { name: 'Limpar', exact: true }).count() === 0);
  check('"Máquina, PNC ou cliente" está na faixa', (await page.getByRole('button', { name: /Máquina, PNC ou cliente/ }).boundingBox()).y < 200);
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('sem rolagem horizontal em 1366', largura.doc <= largura.win, JSON.stringify(largura));
  await shot(page, `${theme}-1366-atendimento-faixa-vazio`);
});

await step('Os campos de cliente/máquina abrem na faixa, brancos, e o contexto aparece legível', async () => {
  await page.getByRole('button', { name: /Máquina, PNC ou cliente/ }).click();
  const modelo = page.getByPlaceholder('Ex.: 143RII');
  await modelo.waitFor({ timeout: 5000 });
  check('os quatro campos aparecem (cliente, modelo, PNC, série)', await page.getByPlaceholder('Nome do cliente').isVisible() && await modelo.isVisible() && await page.getByPlaceholder(/^Ex\.: 967/).isVisible() && await page.getByPlaceholder('Quando necessário').isVisible());
  check('os campos têm fundo branco', (await modelo.evaluate(el => getComputedStyle(el).backgroundColor)) === 'rgb(255, 255, 255)');
  await page.getByPlaceholder('Nome do cliente').fill('Sr. Carlos');
  await modelo.fill('143RII');
  await page.waitForTimeout(400);
  check('com contexto aparecem o nome, o modelo e "Editar"', (await textoDaTela()).includes('Sr. Carlos') && (await textoDaTela()).includes('143RII') && await page.getByRole('button', { name: /Ocultar dados|Editar/ }).isVisible());
  await shot(page, `${theme}-1366-atendimento-faixa-contexto`);
  await page.getByRole('button', { name: 'Ocultar dados' }).click();
  check('com contexto, o placeholder da busca muda e cabe inteiro', await campo.evaluate(el => el.scrollWidth <= el.clientWidth + 1 && /pergunta sobre este equipamento/.test(el.placeholder)));
});

await step('Busca: os resultados e o orçamento ao lado continuam como antes', async () => {
  await campo.fill('carburador 143RII');
  await campo.press('Enter');
  await page.locator('[data-row-add]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  check('"Limpar" aparece com texto e o selo Ctrl K some', await page.getByRole('button', { name: 'Limpar', exact: true }).isVisible() && !(await textoDaTela()).includes('Ctrl K'));
  const linha = await page.locator('[data-row-add]').first().boundingBox();
  check('a primeira linha de resultado aparece na primeira tela (antes de 560 px)', linha.y < 560, String(linha.y));
  await page.locator('[data-row-add]').first().click();
  await page.waitForTimeout(500);
  check('+ Orçamento põe a peça no orçamento', await page.getByRole('button', { name: /Orçamento/ }).first().isVisible());
  check('sem rolagem horizontal com resultados', await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await shot(page, `${theme}-1366-atendimento-faixa-resultados`);
});

await step('Sugestões e últimas buscas abrem POR CIMA da faixa (não ficam cortadas)', async () => {
  await page.goto(BASE + '/atendimento');
  await campo.waitFor({ timeout: 30000 });
  await campo.fill('');
  await campo.focus();
  await campo.pressSequentially('carbura', { delay: 40 });
  await page.waitForTimeout(1200);
  const lista = page.getByRole('listbox').first();
  if (await lista.count() === 0) return check('(sem sugestões nesta loja para "carbura": nada a medir)', true);
  const caixa = await lista.boundingBox();
  const topo = await page.evaluate(({ x, y }) => { const el = document.elementFromPoint(x, y); return el?.closest('[role=listbox]') !== null; }, { x: caixa.x + caixa.width / 2, y: caixa.y + Math.min(20, caixa.height / 2) });
  check('a lista de sugestões está visível e recebe o clique (nada por cima)', topo);
  await shot(page, `${theme}-1366-atendimento-faixa-sugestoes`);
});

await finish(browser, errors);
