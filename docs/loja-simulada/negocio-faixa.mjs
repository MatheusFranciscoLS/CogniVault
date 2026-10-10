// NEGÓCIO no padrão de faixa (direção B do redesenho, 2026-10-09): faixa com os números grandes, abas (Resumo, Demanda, Lista de preços), aba no endereço,
// "Precisa de você" levando à aba certa, teclado nas abas, e a barra de cima sem texto cortado. Dois temas, 1366×768 (o PC do balcão).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/negocio-faixa.mjs [tema]
import { open, check, step, finish, shot, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const abas = page.getByRole('tablist', { name: 'Seções do Negócio' });
const aba = nome => abas.getByRole('tab', { name: nome });

await page.goto(BASE + '/administracao/negocio');
await abas.waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);

await step('A faixa mostra título, números grandes e a idade da lista de preços', async () => {
  check('há um único h1 "Negócio"', (await page.getByRole('heading', { level: 1 }).allInnerTexts()).join('|') === 'Negócio');
  const texto = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  for (const rotulo of ['ORÇAMENTOS', 'VALOR COTADO', 'TICKET MÉDIO', 'SEM PREÇO', 'LISTA DE PREÇOS']) check(`a faixa tem "${rotulo}"`, texto.toUpperCase().includes(rotulo));
  check('o valor cotado aparece inteiro (sem reticências)', !/R\$[\d.,\s]*…/.test(texto) && /R\$\s?[\d.]+,\d{2}/.test(texto));
  check('a idade da lista aparece ("Atualizada ..." ou "Ainda não atualizada")', /Atualizada (hoje|há \d+ dias?)|Ainda não atualizada/.test(texto));
  check('o botão Atualizar está na faixa', await page.getByRole('button', { name: 'Atualizar', exact: true }).isVisible());
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('sem rolagem horizontal em 1366', largura.doc <= largura.win, JSON.stringify(largura));
  check('a faixa cabe no alto: o conteúdo começa antes de 340 px', (await abas.boundingBox()).y < 340, String((await abas.boundingBox()).y));
  await shot(page, `${theme}-1366-negocio-faixa-resumo`);
});

await step('As abas: papéis certos, clique, setas e endereço', async () => {
  check('Resumo começa selecionada', (await aba('Resumo').getAttribute('aria-selected')) === 'true');
  await aba('Demanda').click();
  check('clicar em Demanda seleciona e põe ?aba=demanda no endereço', (await aba('Demanda').getAttribute('aria-selected')) === 'true' && page.url().endsWith('?aba=demanda'), page.url());
  check('o painel da aba tem o papel tabpanel ligado à aba', await page.locator('#painel-demand[role=tabpanel][aria-labelledby=tab-demand]').count() === 1);
  await aba('Demanda').focus();
  await page.keyboard.press('ArrowRight');
  check('seta para a direita vai para Lista de preços', (await aba('Lista de preços').getAttribute('aria-selected')) === 'true' && page.url().endsWith('?aba=lista'), page.url());
  await page.keyboard.press('ArrowRight');
  check('e dá a volta para Resumo (sem ?aba)', (await aba('Resumo').getAttribute('aria-selected')) === 'true' && !page.url().includes('aba='), page.url());
  await page.keyboard.press('ArrowLeft');
  check('seta para a esquerda volta para Lista de preços', (await aba('Lista de preços').getAttribute('aria-selected')) === 'true');
  check('só a aba selecionada entra na ordem do Tab', (await aba('Resumo').getAttribute('tabindex')) === '-1' && (await aba('Lista de preços').getAttribute('tabindex')) === '0');
  await page.reload();
  await abas.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  check('recarregar mantém a aba do endereço', (await aba('Lista de preços').getAttribute('aria-selected')) === 'true');
  check('a aba "Lista de preços" mostra a atualização da lista', await page.getByRole('region', { name: 'Atualizar a lista de preços' }).isVisible());
  await shot(page, `${theme}-1366-negocio-faixa-lista`);
  await page.goto(BASE + '/administracao/negocio?aba=lixo');
  await abas.waitFor({ timeout: 30000 });
  check('aba desconhecida no endereço cai em Resumo, sem erro', (await aba('Resumo').getAttribute('aria-selected')) === 'true');
});

await step('"Precisa de você" leva à aba onde se resolve', async () => {
  await page.goto(BASE + '/administracao/negocio');
  await abas.waitFor({ timeout: 30000 });
  await page.waitForTimeout(2500);
  const cartao = page.getByRole('region', { name: 'Precisa de você' });
  if (await cartao.locator('li').count() === 0) return check('(a loja simulada não tem pendência: nada a clicar)', true);
  const botao = cartao.getByRole('button').first();
  const nome = await botao.innerText();
  await botao.click();
  const selecionada = await page.evaluate(() => document.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim());
  check(`"${nome}" abre a aba ${/preços|lista/i.test(nome) ? 'Lista de preços' : 'Demanda'}`, /preços|lista/i.test(nome) ? /Lista de preços/.test(selecionada) : /Demanda/.test(selecionada), selecionada);
});

await step('Barra de cima: o campo de busca mostra o texto inteiro e o avatar não sai da tela', async () => {
  await page.goto(BASE + '/orcamentos');
  await page.waitForTimeout(2000);
  const campo = page.getByLabel('Buscar código, descrição, modelo ou PNC');
  const medidas = await campo.evaluate(el => ({ visivel: el.clientWidth, texto: el.scrollWidth, placeholder: el.placeholder }));
  check('o placeholder cabe (sem corte)', medidas.texto <= medidas.visivel + 1, JSON.stringify(medidas));
  check('o placeholder é "Buscar peça ou código"', medidas.placeholder === 'Buscar peça ou código');
  const avatar = await page.getByRole('button', { name: 'Minha conta' }).boundingBox();
  check('o avatar termina dentro da janela, com margem', avatar.x + avatar.width <= 1366 - 12, String(avatar.x + avatar.width));
  const quebrados = await page.evaluate(() => [...document.querySelectorAll('header nav button')].filter(el => el.getBoundingClientRect().height > 60).map(el => el.textContent));
  check('nenhum item do menu quebra em duas linhas', quebrados.length === 0, quebrados.join(','));
  await page.keyboard.press('Control+k');
  check('Ctrl K continua focando a busca', await campo.evaluate(el => el === document.activeElement));
});

await finish(browser, errors);
