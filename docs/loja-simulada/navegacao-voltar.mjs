// NAVEGAÇÃO (2026-10-10): o botão Voltar do navegador (e o botão lateral do mouse) anda tela a tela em vez de sair do app; Avançar volta; trocar a ABA dentro da tela
// e buscar NÃO criam passo de histórico; sair e Voltar não mostra tela privada; rota inexistente cai no Atendimento. E a barra de cima cabe em larguras úteis menores
// (Windows a 125%/150% de zoom dá 1536/1280 px): sem rolagem horizontal, o botão Orçamento continua com nome, e o Ctrl K sem a busca do topo leva ao Atendimento.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/navegacao-voltar.mjs [tema]
import { open, check, step, finish, BASE, SEARCH } from './_t.mjs';

const tema = process.argv[2] ?? 'light';
const caminho = page => new URL(page.url()).pathname;
const titulo = page => page.getByRole('heading', { level: 1 }).first().innerText();
const irPara = async (page, nome) => { await page.getByRole('button', { name: nome, exact: true }).click(); await page.waitForTimeout(700); };

const { browser, page, errors } = await open({ theme: tema, width: 1366, height: 768 });
await page.goto(BASE + '/atendimento');
await page.getByPlaceholder(SEARCH).waitFor({ timeout: 30000 });

await step('Voltar e Avançar andam tela a tela', async () => {
  await irPara(page, 'Orçamentos');
  await irPara(page, 'Tabela de preços');
  check('chegou em Tabela de preços', caminho(page) === '/tabela-de-precos' && (await titulo(page)) === 'Tabela de preços');
  await page.goBack(); await page.waitForTimeout(800);
  check('Voltar 1x: Orçamentos, com a tela de Orçamentos', caminho(page) === '/orcamentos' && (await titulo(page)) === 'Orçamentos', caminho(page));
  await page.goBack(); await page.waitForTimeout(800);
  check('Voltar 2x: Atendimento, com a tela de Atendimento e o título da aba', caminho(page) === '/atendimento' && /^Atendimento/.test(await page.title()), `${caminho(page)} | ${await page.title()}`);
  await page.goForward(); await page.waitForTimeout(800);
  check('Avançar: Orçamentos de novo', caminho(page) === '/orcamentos' && (await titulo(page)) === 'Orçamentos');
  await page.goForward(); await page.waitForTimeout(800);
  check('Avançar: Tabela de preços de novo', caminho(page) === '/tabela-de-precos' && (await titulo(page)) === 'Tabela de preços');
});

await step('Clicar na tela em que já está não cria passo', async () => {
  const antes = await page.evaluate(() => history.length);
  await irPara(page, 'Tabela de preços');
  check('o histórico não cresceu', (await page.evaluate(() => history.length)) === antes, `${antes} -> ${await page.evaluate(() => history.length)}`);
});

await step('Trocar a ABA dentro da tela e buscar não criam passo; Voltar sai da tela, não da aba', async () => {
  await page.getByRole('button', { name: 'Administração' }).click();
  await page.getByRole('menuitem', { name: 'Negócio' }).click(); await page.waitForTimeout(1500);
  check('abriu o Negócio', caminho(page) === '/administracao/negocio');
  const antes = await page.evaluate(() => history.length);
  await page.getByRole('tab', { name: 'Demanda' }).click(); await page.waitForTimeout(400);
  await page.getByRole('tab', { name: 'Lista de preços' }).click(); await page.waitForTimeout(400);
  check('trocar de aba (?aba=) não cria passo de histórico', (await page.evaluate(() => history.length)) === antes, `${antes} -> ${await page.evaluate(() => history.length)}`);
  await page.goBack(); await page.waitForTimeout(900);
  check('Voltar sai do Negócio para a tela anterior (Tabela de preços), não para a aba anterior', caminho(page) === '/tabela-de-precos', caminho(page));
});

await step('Voltar depois de uma busca no Atendimento volta ao Atendimento com a busca', async () => {
  await irPara(page, 'Atendimento');
  const campo = page.getByPlaceholder(SEARCH);
  await campo.fill('carburador 143RII'); await campo.press('Enter');
  await page.locator('[data-row-add]').first().waitFor({ timeout: 30000 });
  await irPara(page, 'Catálogos');
  check('chegou em Catálogos', caminho(page) === '/catalogos');
  await page.goBack(); await page.waitForTimeout(1500);
  check('Voltar: Atendimento', caminho(page) === '/atendimento', page.url());
  check('o campo de busca existe e a tela é utilizável (sem tela branca)', await page.getByPlaceholder(SEARCH).isVisible());
});

await step('Rota inexistente, raiz e sair + Voltar', async () => {
  await page.goto(BASE + '/pagina-que-nao-existe'); await page.waitForTimeout(1200);
  check('rota inexistente cai no Atendimento (sem tela de erro)', caminho(page) === '/atendimento' && (await titulo(page)) === 'Atendimento');
  await page.goto(BASE + '/'); await page.waitForTimeout(1200);
  check('a raiz também', caminho(page) === '/atendimento');
  await page.goto(BASE + '/orcamentos'); await page.waitForTimeout(1500);
  await page.getByRole('button', { name: 'Minha conta' }).click();
  await page.getByRole('menuitem', { name: 'Sair' }).click(); await page.waitForTimeout(1500);
  check('Sair leva ao login', caminho(page) === '/login');
  await page.goBack(); await page.waitForTimeout(1500);
  check('Voltar depois de Sair NÃO mostra a tela privada', !/orçamentos arquivados/i.test(await page.locator('body').innerText()), caminho(page));
});
await browser.close();

// larguras úteis menores (zoom do Windows)
for (const [w, h] of [[1536, 864], [1366, 768], [1280, 720], [1152, 648], [1024, 640]]) {
  const sessao = await open({ theme: tema, width: w, height: h });
  await step(`Barra de cima em ${w}×${h}`, async () => {
    const semRolagem = [];
    for (const rota of ['/atendimento', '/catalogos', '/orcamentos', '/conserto', '/tabela-de-precos', '/administracao/negocio', '/administracao/usuarios']) {
      await sessao.page.goto(BASE + rota); await sessao.page.waitForTimeout(1500);
      const m = await sessao.page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: innerWidth }));
      if (m.doc > m.win) semRolagem.push(`${rota} +${m.doc - m.win}px`);
    }
    check(`sem rolagem horizontal nas 7 telas em ${w} px`, semRolagem.length === 0, semRolagem.join(', '));
    check('o botão Orçamento continua com nome para leitor de tela e visível', await sessao.page.getByRole('button', { name: /^Orçamento/ }).first().isVisible());
    check('o avatar termina dentro da janela', (await sessao.page.getByRole('button', { name: 'Minha conta' }).boundingBox()).x + 40 <= w);
    if (w < 1200) {
      await sessao.page.goto(BASE + '/orcamentos'); await sessao.page.waitForTimeout(1200);
      check('sem a busca do topo (janela estreita), Ctrl K leva ao Atendimento', await sessao.page.locator('#cv-workspace-search').evaluate(el => el.offsetParent === null));
      await sessao.page.keyboard.press('Control+k'); await sessao.page.waitForTimeout(1200);
      check('Ctrl K abriu o Atendimento', caminho(sessao.page) === '/atendimento', caminho(sessao.page));
    }
  });
  await sessao.browser.close();
}

// 401 depois do passo de Sair é esperado: a sessão acabou de ser encerrada de propósito.
await finish({ close: async () => {} }, errors.filter(e => !/status of 40[19]/.test(e)));
