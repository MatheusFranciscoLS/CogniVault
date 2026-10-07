// Aba TABELA DE PREÇOS inteira (máquinas da lista vigente da Husqvarna): lista, busca, filtros, ordenação,
// novidades, gaveta da máquina, "o que acompanha", vista explodida e acesso do balcão.
// Pré-requisito: a lista de máquinas importada na loja simulada (npm run import:machine-list-html).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/tabela-precos-completo.mjs [tema]
import { open, check, step, finish, shot, sqlSim, BASE, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });
const total = Number(sqlSim('SELECT count(*) FROM "MachineListing"'));
const brl = n => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }).replace(/ /g, ' ');
const linhas = () => page.locator('main tbody tr', { has: page.locator('td') });
const contagem = async () => Number(((await page.locator('main [aria-live="polite"]').innerText()).match(/(\d+)/) ?? [])[1]);

await page.getByRole('button', { name: 'Tabela de preços', exact: true }).click();
await page.getByRole('heading', { name: 'Tabela de preços', level: 1 }).waitFor({ timeout: 15000 });
await page.locator('main tbody tr td').first().waitFor({ timeout: 15000 });

await step('abertura', async () => {
  check('a aba existe no menu para todos e abre', total > 100, `${total} máquinas no banco`);
  check('mostra todas as máquinas da lista', (await linhas().count()) === total && (await contagem()) === total, `${await linhas().count()} linhas`);
  const texto = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  const data = sqlSim(`SELECT to_char("listDate" AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY') FROM "MachineListing" LIMIT 1`);
  check('mostra a data da lista', texto.includes(`Lista de ${data}`), data);
  check('o campo de busca já está com o foco (teclado primeiro)', await page.getByLabel('Buscar máquina na tabela').evaluate(e => e === document.activeElement));
  check('colunas: Modelo, PNC, Aplicação e Preço da lista', ['Modelo', 'PNC', 'Aplicação', 'Preço da lista'].every(c => texto.includes(c)));
  check('agrupa por categoria com título de grupo', (await page.locator('main tbody th[scope="colgroup"]').count()) > 5);
  check('a categoria aparece em frase, não em caixa-alta', !(await page.locator('main tbody th[scope="colgroup"]').allInnerTexts()).some(t => t === t.toUpperCase() && t.length > 4));
  await shot(page, `${theme}-1366-tabela-precos`);
});

await step('preço é o da lista, sem a divisão por 0,92', async () => {
  const [pnc, modelo, preco] = sqlSim(`SELECT pnc || '|' || model || '|' || "listPrice" FROM "MachineListing" WHERE "priceBefore" IS NULL ORDER BY model LIMIT 1`).split('|');
  const linha = page.locator('main tbody tr', { hasText: pnc });
  const mostrado = await linha.locator('td').last().innerText();
  check('o preço na tela é exatamente o da lista', mostrado.includes(brl(Number(preco))), `${modelo}: ${mostrado.replace(/\s+/g, ' ')} (banco ${preco})`);
  check('não é o preço dividido por 0,92', !mostrado.includes(brl(Math.round(Number(preco) / 0.92 * 100) / 100)));
});

await step('busca', async () => {
  const campo = page.getByLabel('Buscar máquina na tabela');
  await campo.fill('143');
  const n1 = await contagem();
  check('busca por modelo filtra', n1 > 0 && n1 < total, `${n1}`);
  check('o resultado traz a roçadeira 143', (await page.locator('main tbody').innerText()).includes('143'));
  await campo.fill('rocadeira');
  const n2 = await contagem();
  check('busca sem acento acha "Roçadeira"', n2 >= 10, `${n2}`);
  await campo.fill('ROÇADEIRA 143RS');
  check('várias palavras, com acento e caixa-alta, em qualquer ordem', (await contagem()) === 2 && (await page.locator('main tbody').innerText()).includes('143RST'));
  const pnc = sqlSim(`SELECT pnc FROM "MachineListing" WHERE model = '143R II' OR model ILIKE '143R%' LIMIT 1`);
  await campo.fill(pnc);
  check('busca por PNC acha exatamente a máquina', (await contagem()) === 1, pnc);
  await campo.fill('zzzqqq');
  check('sem resultado: avisa e oferece limpar', (await page.getByText('Nenhuma máquina com esses filtros.').isVisible()) && (await contagem()) === 0);
  await page.getByRole('button', { name: 'Limpar filtros' }).click();
  check('"Limpar filtros" volta à lista inteira e esvazia a busca', (await contagem()) === total && (await campo.inputValue()) === '');
});

await step('filtros', async () => {
  const grupo = page.getByRole('group', { name: 'Tecnologia' });
  const nBateria = Number(sqlSim(`SELECT count(*) FROM "MachineListing" WHERE technology = 'BATERIA'`));
  await grupo.getByRole('button', { name: /^Bateria/ }).click();
  check('tecnologia Bateria mostra só as de bateria', (await contagem()) === nBateria, `${nBateria}`);
  check('o botão ativo fica marcado (aria-pressed)', (await grupo.getByRole('button', { name: /^Bateria/ }).getAttribute('aria-pressed')) === 'true');
  const opcoes = await page.getByLabel('Categoria').locator('option').allInnerTexts();
  const somaCategorias = opcoes.slice(1).reduce((s, o) => s + Number((o.match(/\((\d+)\)/) ?? [])[1] ?? 0), 0);
  check('as categorias oferecidas respeitam o filtro e somam o total', somaCategorias === nBateria, `${opcoes.length - 1} categorias, soma ${somaCategorias}`);
  await page.getByRole('button', { name: 'Limpar' }).click();
  check('"Limpar" desfaz tudo', (await contagem()) === total);

  const cat = await page.getByLabel('Categoria').locator('option').nth(1).getAttribute('value');
  await page.getByLabel('Categoria').selectOption(cat);
  const nCat = Number(sqlSim(`SELECT count(*) FROM "MachineListing" WHERE category = '${cat.replace(/'/g, "''")}'`));
  check('filtro de categoria', (await contagem()) === nCat, `${cat}: ${nCat}`);
  await page.getByRole('button', { name: 'Limpar' }).click();

  await page.getByLabel('Aplicação').selectOption('PROFISSIONAL');
  const nPro = Number(sqlSim(`SELECT count(*) FROM "MachineListing" WHERE application = 'PROFISSIONAL'`));
  check('filtro de aplicação Profissional', (await contagem()) === nPro, `${nPro}`);
  await page.getByLabel('Buscar máquina na tabela').fill('motosserra');
  const nProMoto = Number(sqlSim(`SELECT count(*) FROM "MachineListing" WHERE application = 'PROFISSIONAL' AND (category ILIKE '%motosserra%' OR description ILIKE '%motosserra%' OR model ILIKE '%motosserra%')`));
  check('filtros se combinam com a busca', (await contagem()) === nProMoto, `${nProMoto}`);
  await page.getByRole('button', { name: 'Limpar' }).click();
});

await step('novidades da lista', async () => {
  const nNov = Number(sqlSim(`SELECT count(*) FROM "MachineListing" WHERE "isNew" OR "priceBefore" IS NOT NULL`));
  const botao = page.getByRole('button', { name: /^Novidades da lista/ });
  check('o botão traz a quantidade', (await botao.innerText()).includes(`(${nNov})`), `${nNov}`);
  await botao.click();
  check('mostra só as novas ou com preço alterado', (await contagem()) === nNov);
  const texto = await page.locator('main tbody').innerText();
  check('máquina nova tem o selo "Nova"', /Nova/.test(texto));
  check('mudança de preço mostra de quanto era', /(Baixou|Subiu) de R\$/.test(texto));
  const [pncB, antes, agora] = sqlSim(`SELECT pnc || '|' || "priceBefore" || '|' || "listPrice" FROM "MachineListing" WHERE "priceBefore" IS NOT NULL LIMIT 1`).split('|');
  const celula = await page.locator('main tbody tr', { hasText: pncB }).locator('td').last().innerText();
  check('o preço de antes e o de agora batem com o banco', celula.includes(brl(Number(antes))) && celula.includes(brl(Number(agora))), celula.replace(/\s+/g, ' '));
  await shot(page, `${theme}-1366-tabela-precos-novidades`);
  await page.getByRole('button', { name: 'Limpar' }).click();
});

await step('ordenação', async () => {
  const precoCabecalho = page.getByRole('columnheader', { name: /Preço da lista/ });
  await precoCabecalho.getByRole('button').click();
  const primeiro = async () => Number(sqlSim(`SELECT "listPrice" FROM "MachineListing" WHERE pnc = '${(await page.locator('main tbody tr td:nth-child(2)').first().innerText()).trim()}'`));
  const min = Number(sqlSim('SELECT min("listPrice") FROM "MachineListing"'));
  const max = Number(sqlSim('SELECT max("listPrice") FROM "MachineListing"'));
  check('preço crescente começa no mais barato', (await primeiro()) === min, brl(min));
  check('aria-sort diz "ascending"', (await precoCabecalho.getAttribute('aria-sort')) === 'ascending');
  check('ordenado por preço some o agrupamento por categoria', (await page.locator('main tbody th[scope="colgroup"]').count()) === 0);
  await precoCabecalho.getByRole('button').click();
  check('segundo clique inverte: mais caro primeiro', (await primeiro()) === max, brl(max));
  await page.getByRole('columnheader', { name: /^Modelo/ }).getByRole('button').click();
  check('ordenar por Modelo funciona', (await page.locator('main tbody tr td:nth-child(2)').count()) === total);
  await page.getByRole('columnheader', { name: /^Modelo/ }).getByRole('button').click();
  check('terceiro estado volta ao agrupamento por categoria', (await page.locator('main tbody th[scope="colgroup"]').count()) > 5);
});

await step('gaveta da máquina', async () => {
  const alvo = sqlSim(`SELECT pnc || '|' || model || '|' || "listPrice" FROM "MachineListing" WHERE pnc ~ '^[0-9]{9}$' AND model = '143R II' LIMIT 1`) || sqlSim(`SELECT pnc || '|' || model || '|' || "listPrice" FROM "MachineListing" WHERE pnc ~ '^[0-9]{9}$' AND details IS NOT NULL LIMIT 1`);
  const [pnc, modelo, preco] = alvo.split('|');
  await page.getByLabel('Buscar máquina na tabela').fill(pnc);
  await page.locator('main tbody tr', { hasText: pnc }).locator('td').first().getByRole('button').click();
  const gaveta = page.getByRole('dialog');
  await gaveta.waitFor({ timeout: 8000 });
  const texto = (await gaveta.innerText()).replace(/\s+/g, ' ');
  check('abre a gaveta com modelo, PNC e preço da lista', texto.includes(modelo) && texto.includes(pnc) && texto.includes(brl(Number(preco))), modelo);
  check('mostra a ficha técnica', (await gaveta.getByText('Ficha técnica').count()) > 0 && (await gaveta.locator('dl > div').count()) > 0, `${await gaveta.locator('dl > div').count()} itens`);
  check('mostra a descrição sem marcação HTML', (await gaveta.getByText('Descrição').count()) > 0 && !/<[a-z]+[^>]*>|&nbsp;/i.test(await gaveta.innerText()));
  await gaveta.getByRole('button', { name: `Copiar PNC ${pnc}` }).click();
  check('copiar PNC põe o PNC na área de transferência', (await page.evaluate(() => navigator.clipboard.readText())) === pnc);
  await gaveta.getByText(/Acompanha|Não acompanha/).first().waitFor({ timeout: 25000 }).catch(() => {});
  const acompanha = await gaveta.getByRole('heading', { name: 'Acompanha' }).count();
  check('"Acompanha" vem do Portal Husqvarna (ou a seção some sem aviso de erro)', acompanha > 0 || !/erro|indispon/i.test(await gaveta.innerText()), acompanha ? `${await gaveta.locator('section ul').first().locator('li').count()} itens` : 'sem resposta do Portal');
  check('não explica o sistema', !/Portal Husqvarna indispon|não foi possível consultar/i.test(await gaveta.innerText()));
  await shot(page, `${theme}-1366-tabela-precos-gaveta`);
  await page.keyboard.press('Escape');
  await gaveta.waitFor({ state: 'hidden', timeout: 4000 });
  check('Esc fecha a gaveta', true);

  // Teclado: Tab chega na linha e Enter abre.
  await page.getByLabel('Buscar máquina na tabela').fill(pnc);
  await page.locator('main tbody tr', { hasText: pnc }).locator('td').first().getByRole('button').focus();
  await page.keyboard.press('Enter');
  await gaveta.waitFor({ timeout: 4000 });
  check('Enter na linha abre a gaveta (teclado primeiro)', true);
  await page.keyboard.press('Escape');
});

await step('abrir a vista explodida', async () => {
  const pnc = sqlSim(`SELECT pnc FROM "MachineListing" WHERE pnc ~ '^[0-9]{9}$' AND model = '143R II' LIMIT 1`) || sqlSim(`SELECT pnc FROM "MachineListing" WHERE pnc ~ '^[0-9]{9}$' LIMIT 1`);
  await page.getByLabel('Buscar máquina na tabela').fill(pnc);
  await page.locator('main tbody tr', { hasText: pnc }).locator('td').first().getByRole('button').click();
  await page.getByRole('button', { name: 'Abrir vista explodida' }).click();
  await page.getByPlaceholder(SEARCH).waitFor({ timeout: 8000 });
  const painel = page.getByRole('dialog', { name: 'Máquina aberta' });
  await painel.waitFor({ timeout: 25000 });
  check('leva ao Atendimento com a máquina aberta', true);
  check('o painel é da máquina pedida', (await painel.innerText()).includes(pnc));
  await page.keyboard.press('Escape');
  await painel.waitFor({ state: 'hidden', timeout: 4000 });
  await page.getByPlaceholder(SEARCH).fill('vela de ignição');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(2500);
  check('uma busca depois NÃO reabre a máquina', (await page.getByRole('dialog', { name: 'Máquina aberta' }).count()) === 0);
});

await step('volta à tabela e link direto', async () => {
  await page.getByRole('button', { name: 'Tabela de preços', exact: true }).click();
  await page.getByRole('heading', { name: 'Tabela de preços', level: 1 }).waitFor({ timeout: 8000 });
  check('voltar à aba mostra a lista de novo (sem nova consulta lenta)', (await linhas().count()) === total);
  await page.goto(`${BASE}/dashboard?tab=prices`);
  await page.getByRole('heading', { name: 'Tabela de preços', level: 1 }).waitFor({ timeout: 15000 });
  check('o link ?tab=prices abre a aba', true);
});

await step('medidas da tela', async () => {
  await page.locator('main tbody tr td').first().waitFor({ timeout: 15000 });
  const estouro = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  check('sem rolagem horizontal', !estouro);
  const pequenos = await page.locator('main').evaluate(m => {
    const ruins = [];
    for (const el of m.querySelectorAll('*')) {
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim())) continue;
      const px = parseFloat(getComputedStyle(el).fontSize);
      if (px < 14) ruins.push(`${px}px "${el.textContent.trim().slice(0, 24)}"`);
    }
    return ruins;
  });
  check('nenhum texto menor que 14 px', pequenos.length === 0, pequenos.slice(0, 3).join(' | '));
  const alvos = await page.locator('main button, main select, main input').evaluateAll(l => l.filter(e => e.getClientRects().length).map(e => ({ h: e.getBoundingClientRect().height, t: (e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20) })).filter(x => x.h < 32));
  check('alvos de clique com pelo menos 32 px de altura', alvos.length === 0, alvos.slice(0, 3).map(a => `${a.t} ${a.h}px`).join(' | '));
});

await step('acesso do balcão', async () => {
  const resposta = await page.request.post(BASE + '/api/login', { data: { email: 'mecanico.e2e@cognivault.local', password: 'CogniVault-E2E-2026!' }, headers: { Origin: BASE } });
  const lista = resposta.ok() ? await page.request.get(BASE + '/api/machine-list') : null;
  check('o balcão também lê a tabela (todos podem ver)', !!lista && lista.ok() && (await lista.json()).machines.length === total, lista ? String(lista.status()) : `login ${resposta.status()}`);
  const anonimo = await (await browser.newContext()).request.get(BASE + '/api/machine-list');
  check('sem login a tabela não abre', anonimo.status() === 401, String(anonimo.status()));
});

await finish(browser, errors);
