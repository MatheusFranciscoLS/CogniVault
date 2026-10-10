// QUALIDADE no padrão de faixa (direção B do redesenho, 2026-10-10): números na faixa, abas (Visão geral, Fila de ação, Técnico & IA), aba no endereço,
// selo na Fila de ação, e o conteúdo de cada aba no lugar. Dois temas, 1366×768 (o PC do balcão).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/qualidade-faixa.mjs [tema]
import { open, check, step, finish, shot, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const abas = page.getByRole('tablist', { name: 'Seções da Qualidade' });
const aba = nome => abas.getByRole('tab', { name: nome });
const textoDaTela = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

await page.goto(BASE + '/administracao/qualidade');
await abas.waitFor({ timeout: 45000 });
await page.waitForTimeout(2500);

await step('A faixa mostra título, os quatro números e o botão de atualizar', async () => {
  check('há um único h1 "Qualidade"', (await page.getByRole('heading', { level: 1 }).allInnerTexts()).join('|') === 'Qualidade');
  const texto = (await textoDaTela()).toUpperCase();
  for (const rotulo of ['CATÁLOGOS UTILIZÁVEIS', 'PRECISAM DE ATENÇÃO', 'PERGUNTAS PENDENTES', 'PEÇAS CONSULTÁVEIS']) check(`a faixa tem "${rotulo}"`, texto.includes(rotulo));
  check('os números não são traço (os dados chegaram)', !(await page.locator('main').innerText()).match(/CATÁLOGOS UTILIZÁVEIS\s*\n\s*—/i));
  check('o botão "Atualizar diagnóstico" está na faixa', await page.getByRole('button', { name: 'Atualizar diagnóstico' }).isVisible());
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('sem rolagem horizontal em 1366', largura.doc <= largura.win, JSON.stringify(largura));
  check('a faixa cabe no alto: as abas começam antes de 340 px', (await abas.boundingBox()).y < 340, String((await abas.boundingBox()).y));
  await shot(page, `${theme}-1366-qualidade-faixa-geral`);
});

await step('Visão geral: cobertura do portfólio e os três cartões', async () => {
  check('Visão geral começa selecionada', (await aba('Visão geral').getAttribute('aria-selected')) === 'true');
  check('o painel tem o papel tabpanel ligado à aba', await page.locator('#painel-geral[role=tabpanel][aria-labelledby=tab-geral]').count() === 1);
  check('a cobertura do portfólio está na aba', await page.getByRole('region', { name: 'Cobertura técnica do portfólio' }).isVisible());
  const texto = await textoDaTela();
  for (const t of ['Leitura visual de PDFs', 'Conferência no Portal', 'Estatísticas de extração']) check(`mostra "${t}"`, texto.includes(t));
});

await step('As abas: papéis certos, clique, setas e endereço', async () => {
  await aba('Fila de ação').click();
  check('clicar em Fila de ação seleciona e põe ?aba=fila no endereço', (await aba('Fila de ação').getAttribute('aria-selected')) === 'true' && page.url().endsWith('?aba=fila'), page.url());
  const texto = await textoDaTela();
  check('a fila mostra "Catálogos para conferir" e "Consultas sem solução"', texto.includes('Catálogos para conferir') && texto.includes('Consultas sem solução'));
  await shot(page, `${theme}-1366-qualidade-faixa-fila`);
  await aba('Fila de ação').focus();
  await page.keyboard.press('ArrowRight');
  check('seta para a direita vai para Técnico & IA', (await aba('Técnico & IA').getAttribute('aria-selected')) === 'true' && page.url().endsWith('?aba=tecnico'), page.url());
  const tecnico = await textoDaTela();
  check('Técnico mostra "IA e indexação" e o teste de regressão', tecnico.includes('IA e indexação') && tecnico.includes('Teste de regressão da busca'));
  check('o botão "Executar teste agora" está lá', await page.getByRole('button', { name: 'Executar teste agora' }).isVisible());
  await shot(page, `${theme}-1366-qualidade-faixa-tecnico`);
  await page.keyboard.press('ArrowRight');
  check('e dá a volta para Visão geral (sem ?aba)', (await aba('Visão geral').getAttribute('aria-selected')) === 'true' && !page.url().includes('aba='), page.url());
  await page.keyboard.press('ArrowLeft');
  check('seta para a esquerda volta para Técnico & IA', (await aba('Técnico & IA').getAttribute('aria-selected')) === 'true');
  check('só a aba selecionada entra na ordem do Tab', (await aba('Visão geral').getAttribute('tabindex')) === '-1' && (await aba('Técnico & IA').getAttribute('tabindex')) === '0');
  await page.reload();
  await abas.waitFor({ timeout: 45000 });
  await page.waitForTimeout(1500);
  check('recarregar mantém a aba do endereço', (await aba('Técnico & IA').getAttribute('aria-selected')) === 'true');
  await page.goto(BASE + '/administracao/qualidade?aba=lixo');
  await abas.waitFor({ timeout: 45000 });
  check('aba desconhecida no endereço cai em Visão geral, sem erro', (await aba('Visão geral').getAttribute('aria-selected')) === 'true');
  await page.goto(BASE + '/administracao/qualidade?aba=fila');
  await abas.waitFor({ timeout: 45000 });
  check('abrir direto em ?aba=fila abre a fila', (await aba('Fila de ação').getAttribute('aria-selected')) === 'true');
});

await step('O selo da Fila de ação soma o que espera o dono', async () => {
  const selo = await aba('Fila de ação').locator('span').first().innerText().catch(() => '');
  const faixa = await page.locator('main').innerText();
  const numeros = n => Number((faixa.match(new RegExp(`${n}\\s*\\n\\s*([\\d.]+)`, 'i')) ?? [])[1]?.replace(/\./g, '') ?? NaN);
  const atencao = numeros('PRECISAM DE ATENÇÃO'), perguntas = numeros('PERGUNTAS PENDENTES');
  if (!selo) return check('(sem pendência: a Fila de ação fica sem selo)', atencao === 0 && perguntas === 0, `${atencao} ${perguntas}`);
  check('o selo é pelo menos a soma dos dois números da faixa', Number(selo) >= (atencao || 0) + (perguntas || 0), `${selo} vs ${atencao}+${perguntas}`);
});

// Recarregar no meio da conferência automática do Portal deixa a anterior ainda rodando no servidor: a segunda recebe 409 ("já em andamento"),
// que o painel trata como transitório e repete. Só esse erro é esperado aqui; qualquer outro reprova.
const inesperados = errors.filter(erro => !/status of 409/.test(erro));
await finish(browser, inesperados);
