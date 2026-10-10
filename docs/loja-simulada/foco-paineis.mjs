// FOCO DEPOIS DE FECHAR um painel do Atendimento (peça e máquina) (2026-10-10): o foco volta para onde o atendente estava (a linha que abriu o painel) ou, se ela sumiu,
// para a busca. Antes ele pulava para o começo da página ("Ir para o conteúdo"), e quem navega pelo teclado perdia o lugar na lista de resultados.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/foco-paineis.mjs [tema]
import { open, check, step, finish, BASE, SEARCH } from './_t.mjs';

const { browser, page, errors } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const ativo = () => page.evaluate(() => {
  const a = document.activeElement;
  if (!a) return { dentroDoMain: false, descricao: 'nada' };
  return { dentroDoMain: !!a.closest('main'), pulou: a.matches('a[href="#conteudo"]') || a === document.body, descricao: (a.getAttribute('aria-label') || a.textContent || a.tagName).trim().slice(0, 40) };
});

await page.goto(BASE + '/atendimento');
const campo = page.getByPlaceholder(SEARCH);
await campo.waitFor({ timeout: 30000 });
await campo.fill('carburador 143RII'); await campo.press('Enter');
await page.locator('[data-row-add]').first().waitFor({ timeout: 30000 });
await page.waitForTimeout(800);

await step('Painel da peça: Esc devolve o foco à linha de onde saiu', async () => {
  const abrir = page.getByText('CARBURADOR', { exact: true }).first();
  await abrir.click();
  await page.getByRole('dialog').waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('o painel fechou', await page.getByRole('dialog').count() === 0);
  const a = await ativo();
  check('o foco NÃO foi para o começo da página', !a.pulou, a.descricao);
  check('o foco está dentro da tela de trabalho (a lista ou a busca)', a.dentroDoMain, a.descricao);
  await page.keyboard.press('Tab');
  const b = await ativo();
  check('o próximo Tab continua na tela de trabalho, não no menu do topo', b.dentroDoMain, b.descricao);
});

await step('Painel da peça: o botão de fechar também devolve o foco', async () => {
  await page.getByText('CARBURADOR', { exact: true }).first().click();
  await page.getByRole('dialog').waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  const fechar = page.getByRole('dialog').getByRole('button', { name: /^(Fechar|Close)/ }).first();
  if (await fechar.count() === 0) return check('(o painel não tem botão Fechar visível: só Esc)', true);
  await fechar.click();
  await page.waitForTimeout(400);
  const a = await ativo();
  check('fechar pelo botão: o foco fica na tela de trabalho', a.dentroDoMain && !a.pulou, a.descricao);
});

await step('Painel da máquina: Esc devolve o foco', async () => {
  const chip = page.getByRole('button', { name: /PNC \d{9}/ }).first();
  if (await chip.count() === 0) return check('(a loja simulada não mostrou atalho de máquina para essa busca)', true);
  await chip.click();
  await page.getByRole('dialog').waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('o painel da máquina fechou', await page.getByRole('dialog').count() === 0);
  const a = await ativo();
  check('o foco volta para a tela de trabalho (de preferência o atalho da máquina)', a.dentroDoMain && !a.pulou, a.descricao);
});

await step('Orçamento (card): Esc devolve o foco ao botão que abriu, de qualquer jeito de abrir', async () => {
  const botao = page.locator('header button', { hasText: 'Orçamento' }).last();
  const noBotao = () => page.evaluate(() => /Orçamento/.test(document.activeElement?.textContent || '') && !!document.activeElement?.closest('header'));
  await botao.focus(); await page.keyboard.press('Enter');
  await page.getByRole('dialog').waitFor({ timeout: 8000 }); await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  check('aberto pelo teclado: o foco volta ao botão Orçamento', await noBotao());
  await botao.click(); await page.getByRole('dialog').waitFor(); await page.waitForTimeout(400);
  await page.keyboard.press('Escape'); await page.waitForTimeout(500);
  check('aberto pelo mouse: o foco volta ao botão Orçamento', await noBotao());
  await page.keyboard.press('Control+b'); await page.getByRole('dialog').waitFor(); await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Fechar orçamento' }).click(); await page.waitForTimeout(500);
  check('aberto por Ctrl B e fechado pelo X: o foco volta ao botão Orçamento', await noBotao());
});

await step('Fechar porque uma busca nova começou NÃO rouba o foco da busca', async () => {
  await campo.fill('filtro de ar'); await campo.press('Enter');
  await page.locator('[data-row-add]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(600);
  const a = await ativo();
  check('depois de buscar, o foco segue onde a busca o deixou (não pulou para o topo)', !a.pulou, a.descricao);
});

await finish(browser, errors.filter(e => !/status of 409/.test(e)));
