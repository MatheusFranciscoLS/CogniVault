// VISÃO GERAL no padrão de faixa (direção B do redesenho, 2026-10-10): três números na faixa, abas Registro de ações (padrão) e Uso de IA e cobertura técnica,
// aba no endereço, o registro filtrando como antes, e o uso de IA só carregando ao abrir a aba. Dois temas, 1366×768 (o PC do balcão).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/visao-geral-faixa.mjs [tema]
import { open, check, step, finish, shot, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const abas = page.getByRole('tablist', { name: 'Seções da Visão geral' });
const aba = nome => abas.getByRole('tab', { name: nome });
const textoDaTela = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

const pedidosDeIa = [];
page.on('request', request => { if (request.url().includes('/api/admin/performance')) pedidosDeIa.push(request.url()); });

await page.goto(BASE + '/administracao/visao-geral');
await abas.waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);

await step('A faixa mostra título e os três números', async () => {
  check('há um único h1 "Visão geral"', (await page.getByRole('heading', { level: 1 }).allInnerTexts()).join('|') === 'Visão geral');
  const texto = (await textoDaTela()).toUpperCase();
  for (const rotulo of ['CATÁLOGOS ATIVOS', 'PEÇAS CONSULTÁVEIS', 'USUÁRIOS ATIVOS']) check(`a faixa tem "${rotulo}"`, texto.includes(rotulo));
  check('os números chegaram (não ficaram em traço)', !/CATÁLOGOS ATIVOS\s+—/.test(texto) && !/USUÁRIOS ATIVOS\s+—/.test(texto));
  check('o estado dos catálogos aparece ("Tudo em dia", "processando" ou "com falha")', /TUDO EM DIA|PROCESSANDO|COM FALHA/.test(texto));
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('sem rolagem horizontal em 1366', largura.doc <= largura.win, JSON.stringify(largura));
  check('a faixa cabe no alto: as abas começam antes de 340 px', (await abas.boundingBox()).y < 340, String((await abas.boundingBox()).y));
  await shot(page, `${theme}-1366-visao-geral-faixa-registro`);
});

await step('Registro de ações: abre como antes e filtra', async () => {
  check('Registro de ações começa selecionada', (await aba('Registro de ações').getAttribute('aria-selected')) === 'true');
  check('o painel tem o papel tabpanel ligado à aba', await page.locator('#painel-audit[role=tabpanel][aria-labelledby=tab-audit]').count() === 1);
  check('o título "Registro de ações" está na tela', await page.getByRole('heading', { name: 'Registro de ações', level: 2 }).isVisible());
  const filtro = page.getByLabel('Filtrar o registro de ações');
  check('o campo de filtro existe', await filtro.isVisible());
  await filtro.fill('zzz-nada-assim-existe');
  await page.waitForTimeout(300);
  check('filtro sem resultado diz "Nenhuma ação encontrada."', (await textoDaTela()).includes('Nenhuma ação encontrada.'));
  await filtro.fill('');
  check('o uso de IA NÃO foi buscado ao abrir a tela (só ao abrir a aba)', pedidosDeIa.length === 0, String(pedidosDeIa.length));
});

await step('Uso de IA e cobertura técnica: só carrega ao abrir a aba', async () => {
  await aba('Uso de IA e cobertura técnica').click();
  check('clicar seleciona e põe ?aba=ia no endereço', (await aba('Uso de IA e cobertura técnica').getAttribute('aria-selected')) === 'true' && page.url().endsWith('?aba=ia'), page.url());
  await page.getByRole('heading', { name: 'Uso de IA e cobertura técnica', level: 2 }).waitFor({ timeout: 20000 });
  check('o painel de IA aparece', true);
  check('o uso de IA foi buscado uma vez', pedidosDeIa.length >= 1, String(pedidosDeIa.length));
  check('o painel tem o papel tabpanel ligado à aba', await page.locator('#painel-ai[role=tabpanel][aria-labelledby=tab-ai]').count() === 1);
  await shot(page, `${theme}-1366-visao-geral-faixa-ia`);
});

await step('Teclado e endereço', async () => {
  await aba('Uso de IA e cobertura técnica').focus();
  await page.keyboard.press('ArrowRight');
  check('seta para a direita dá a volta para o Registro (sem ?aba)', (await aba('Registro de ações').getAttribute('aria-selected')) === 'true' && !page.url().includes('aba='), page.url());
  await page.keyboard.press('ArrowLeft');
  check('seta para a esquerda volta para o uso de IA', (await aba('Uso de IA e cobertura técnica').getAttribute('aria-selected')) === 'true');
  check('só a aba selecionada entra na ordem do Tab', (await aba('Registro de ações').getAttribute('tabindex')) === '-1' && (await aba('Uso de IA e cobertura técnica').getAttribute('tabindex')) === '0');
  await page.reload();
  await abas.waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  check('recarregar mantém a aba do endereço', (await aba('Uso de IA e cobertura técnica').getAttribute('aria-selected')) === 'true');
  await page.goto(BASE + '/administracao/visao-geral?aba=lixo');
  await abas.waitFor({ timeout: 30000 });
  check('aba desconhecida no endereço cai no Registro, sem erro', (await aba('Registro de ações').getAttribute('aria-selected')) === 'true');
});

await finish(browser, errors);
