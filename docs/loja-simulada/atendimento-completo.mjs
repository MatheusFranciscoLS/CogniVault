// Tela ATENDIMENTO inteira: cabeçalho, contexto do cliente/máquina, busca (código, descrição, acento, vazio),
// resultados (grupos, linhas, atalhos), faixa de orçamento e menus. Uso (de frontend/): node ../docs/loja-simulada/atendimento-completo.mjs [tema]
import { open, check, step, finish, shot, confirmar, SEARCH, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });
const busca = page.getByPlaceholder(SEARCH);
await busca.waitFor();

const pesquisar = async (texto, via = 'botao') => {
  await busca.fill(texto);
  if (via === 'enter') await busca.press('Enter');
  else await page.getByRole('button', { name: /^(Buscar|Buscando…)$/ }).click();
};
// Espera a busca COMEÇAR ("Buscando…") e TERMINAR. Sem a primeira metade, o roteiro olhava a tela antes do resultado.
const esperarFim = async (ms = 40000) => {
  await page.getByRole('button', { name: 'Buscando…' }).waitFor({ timeout: 4000 }).catch(() => {});
  await page.getByRole('button', { name: 'Buscar', exact: true }).waitFor({ timeout: ms });
  // O botão volta assim que há peças; a fase "por significado" ainda pode acrescentar linhas. (A rede nunca fica "idle" nesta tela, então espera um tempo fixo.)
  await page.waitForTimeout(1500);
};

await step('estado vazio', async () => {
  check('campo de busca visível e focável', await busca.isVisible());
  const exemplos = await page.getByRole('button', { name: /^(587106701|carburador 143RII)$/ }).count();
  check('exemplos de busca aparecem (o da pergunta saiu junto com o assistente de IA)', exemplos === 2, `${exemplos}`);
  check('faixa de orçamento vazia diz o que fazer', await page.getByText('Adicione peças para montar o orçamento.').isVisible());
  check('"Revisar orçamento" desabilitado com a faixa vazia', await page.getByRole('button', { name: 'Revisar orçamento' }).isDisabled());
  check('Ctrl K foca a busca', await (async () => { await page.locator('body').click({ position: { x: 5, y: 400 } }); await page.keyboard.press('Control+k'); return busca.evaluate(el => el === document.activeElement); })());
});

await step('exemplo clicável', async () => {
  await page.getByRole('button', { name: '587106701' }).click();
  await esperarFim();
  check('clicar num exemplo pesquisa de verdade', (await busca.inputValue()) === '587106701' && (await page.getByRole('button', { name: 'Copiar código 587106701' }).count()) >= 1);
});

await step('busca por código: linha completa', async () => {
  const copiar = page.getByRole('button', { name: 'Copiar código 587106701' }).first();
  await copiar.waitFor({ timeout: 10000 });
  await copiar.click();
  check('copiar põe o código puro', (await page.evaluate(() => navigator.clipboard.readText())) === '587106701');
  const linha = page.locator('article', { has: copiar }).first();
  check('a linha mostra nome, origem e preço', (await linha.innerText()).includes('CARBURADOR') && /R\$\s?\d/.test(await linha.innerText()));
  await linha.getByRole('button', { name: /^\+ Orçamento/ }).click();
  await page.waitForTimeout(600);
  check('+ Orçamento marca a linha como "No orçamento · 1"', await linha.getByRole('button', { name: /No orçamento · 1/ }).isVisible());
  check('faixa de orçamento mostra 1 item', await page.getByText('1 item', { exact: true }).first().isVisible());
  await page.waitForTimeout(500);
  const botaoOrcamento = page.locator('header').getByRole('button', { name: /^Orçamento( \d+)?$/ }).first();
  check('botão do cabeçalho mostra a contagem', (await botaoOrcamento.innerText()).includes('1'), (await botaoOrcamento.innerText()).replace(/\s+/g, ' '));
});

await step('abrir a gaveta da peça pela linha e fechar com Esc', async () => {
  await page.getByRole('button', { name: /Abrir detalhes de/ }).first().click();
  const gaveta = page.getByRole('dialog').first();
  await gaveta.waitFor();
  check('gaveta abre com o código grande', (await gaveta.innerText()).includes('587'));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Esc fecha a gaveta', (await page.getByRole('dialog').count()) === 0);
});

await step('faixa de orçamento: quantidade e remover', async () => {
  const mais = page.getByRole('button', { name: /Aumentar|\+$/ }).first();
  void mais;
  const aside = page.locator('aside').last();
  await aside.getByRole('button', { name: /^\+$|Aumentar quantidade/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  const texto = await aside.innerText();
  check('a faixa de orçamento lista a peça e o total', texto.includes('587') && /R\$\s?\d/.test(texto), texto.replace(/\s+/g, ' ').slice(0, 90));
});

await step('busca por descrição com acento', async () => {
  await pesquisar('vela de ignição', 'enter');
  await esperarFim();
  const n = await page.locator('article').count();
  check('"vela de ignição" acha peças (acento não pode zerar)', n > 0, `${n} linhas`);
});

await step('busca sem resultado', async () => {
  await pesquisar('zzzqqq123');
  await esperarFim();
  check('busca vazia não deixa a tela sem explicação', (await page.locator('article').count()) === 0 && (await page.locator('main').innerText()).length > 40);
  await shot(page, `${theme}-1366-atendimento-vazio-resultado`);
});

await step('Limpar', async () => {
  await page.locator('form', { has: busca }).getByRole('button', { name: 'Limpar' }).click();
  check('Limpar esvazia o campo', (await busca.inputValue()) === '');
});

await step('busca descritiva com máquina: grupos e ordem', async () => {
  await pesquisar('carburador 143RII', 'enter');
  await esperarFim();
  const titulos = await page.locator('main h2, main h3').allInnerTexts();
  console.log(`   títulos na tela: ${titulos.map(t => t.replace(/\s+/g, ' ').slice(0, 40)).join(' | ')}`);
  // A ordem visual tem que ser a ordem do DOM (teclado e leitor de tela seguem o DOM).
  const ordem = await page.locator('article').evaluateAll(list => list.map(a => Math.round(a.getBoundingClientRect().top)));
  check('as linhas aparecem de cima para baixo na ordem do DOM', ordem.every((v, i) => i === 0 || v >= ordem[i - 1]), ordem.slice(0, 6).join(','));
  const semAcao = await page.locator('article').evaluateAll(list => list.filter(a => !a.querySelector('button[aria-label^="Copiar código"]')).length);
  check('toda linha tem o botão de copiar código', semAcao === 0, `${semAcao} sem`);
});

await step('chips: máquina, documentos e "Mais N"', async () => {
  const maquina = page.getByRole('button', { name: /HUSQVARNA Roçadeira Husqvarna 143R II/ });
  if (await maquina.count()) {
    await maquina.click();
    const painel = page.getByRole('dialog', { name: 'Máquina aberta' });
    await painel.waitFor({ timeout: 20000 });
    check('chip da máquina abre o painel da vista explodida', await painel.isVisible());
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  } else check('chip da máquina (não apareceu para esta busca)', false);
  const docs = page.locator('a[href^="https://"]');
  const n = await docs.count();
  const ruins = await docs.evaluateAll(list => list.filter(a => !/husqvarna|aprimocdn/.test(a.href)).map(a => a.href));
  check('links de documento são https e da Husqvarna', n > 0 && ruins.length === 0, `${n} links ${ruins.join(',')}`);
  const mais = page.getByRole('button', { name: /^Mais \d+$/ });
  if (await mais.count()) {
    const antes = await page.locator('a[href^="https://"]').count();
    await mais.click();
    check('"Mais N" revela os outros documentos', (await page.locator('a[href^="https://"]').count()) > antes);
    await page.getByRole('button', { name: 'Mostrar menos' }).click();
  }
});

await step('menu ⋯ de uma linha do cadastro', async () => {
  const menu = page.getByRole('button', { name: /Mais ações para/ }).first();
  await menu.click();
  const itens = await page.getByRole('menuitem').allInnerTexts();
  check('o menu da linha tem ações e nenhuma é repetida', itens.length > 0 && new Set(itens).size === itens.length, itens.join(' | '));
  await page.keyboard.press('Escape');
});

await step('últimas buscas (no lugar do Histórico)', async () => {
  await page.getByRole('button', { name: 'Atendimento', exact: true }).click();
  await page.locator('form', { has: busca }).getByRole('button', { name: 'Limpar' }).click().catch(() => {});
  await busca.fill('');
  await page.keyboard.press('Tab');
  await busca.focus();
  const lista = page.getByRole('listbox', { name: 'Últimas buscas' });
  await lista.waitFor({ timeout: 8000 });
  const itens = await lista.getByRole('option').allInnerTexts();
  check('ao focar o campo vazio aparecem as últimas buscas', itens.length > 0, itens.map(t => t.replace(/\s+/g, ' ')).join(' | ').slice(0, 120));
  check('sem repetição e sem o texto automático da IA', new Set(itens.map(t => t.split('\n')[0].toLowerCase())).size === itens.length && !itens.some(t => /^Analise a pe/i.test(t)));
  await shot(page, `${theme}-1366-atendimento-ultimas-buscas`);
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);
  const escolhida = (await busca.inputValue()).trim();
  check('↓ e Enter refazem a busca escolhida', escolhida.length >= 2 && itens.some(t => t.startsWith(escolhida)), escolhida);
  await busca.fill('');
  await busca.focus();
  await lista.waitFor({ timeout: 8000 });
  await page.keyboard.press('Escape');
  check('Esc fecha a lista sem apagar nada', (await lista.count()) === 0);
  await busca.fill('c');
  check('digitar fecha a lista de últimas buscas', (await lista.count()) === 0);
  await busca.fill('');
});

await step('contexto: cliente, máquina, PNC, série', async () => {
  // Abrir a vista explodida de uma máquina já grava a máquina no atendimento: começa limpo.
  console.log('   botões "Encerrar atendimento":', await page.getByRole('button', { name: 'Encerrar atendimento' }).count());
  await page.getByRole('button', { name: 'Encerrar atendimento' }).first().click({ timeout: 3000 }).catch(e => console.log('   clique falhou:', String(e.message).slice(0, 200)));
  // Com itens no orçamento o site pergunta antes de esvaziar (diálogo do próprio site, não do navegador).
  const perguntou = await confirmar(page, 'Encerrar', { obrigatorio: false });
  check('encerrar com itens no orçamento pergunta antes (diálogo do site)', perguntou);
  await page.waitForTimeout(800);
  console.log('   botões do contexto:', await page.locator('main button').evaluateAll(l => l.slice(0, 5).map(b => b.innerText.replace(/\s+/g, ' '))));
  await shot(page, `${theme}-1366-atendimento-contexto-antes`);
  await page.getByRole('button', { name: /Máquina, PNC ou cliente/ }).click({ timeout: 5000 });
  const campos = ['Nome do cliente', 'Ex.: 143RII', 'Ex.: 967 17 65-01', 'Quando necessário'];
  for (const c of campos) check(`campo "${c}" existe`, (await page.getByPlaceholder(c).count()) === 1);
  await page.getByPlaceholder('Nome do cliente').fill('Sr. Carlos');
  await page.getByPlaceholder('Ex.: 143RII').fill('143RII');
  await page.waitForTimeout(500);
  await page.reload();
  await busca.waitFor();
  check('cliente e máquina digitados sobrevivem ao recarregar', (await page.getByText('Sr. Carlos').count()) > 0 && (await page.getByRole('button', { name: 'Encerrar atendimento' }).count()) === 1);
  await page.getByRole('button', { name: 'Encerrar atendimento' }).click();
  await page.waitForTimeout(400);
  check('Encerrar atendimento limpa o contexto', (await page.getByText('Sr. Carlos').count()) === 0);
});

await step('cabeçalho: abas e menus', async () => {
  for (const aba of ['Catálogos', 'Orçamentos', 'Atendimento']) {
    await page.getByRole('button', { name: aba, exact: true }).click();
    await page.waitForTimeout(600);
    check(`aba ${aba} abre`, (await page.locator('main').innerText()).length > 20);
  }
  check('não existe mais o menu "Mais" (Favoritos e Histórico saíram)', (await page.getByRole('button', { name: 'Mais', exact: true }).count()) === 0);
  await page.getByRole('button', { name: 'Administração' }).click();
  const itensAdm = await page.getByRole('menuitem').allInnerTexts();
  check('menu "Administração" tem Negócio, Visão geral, Usuários e Qualidade (e só eles)', JSON.stringify(itensAdm.map(t => t.trim())) === JSON.stringify(['Negócio', 'Visão geral', 'Usuários', 'Qualidade']), itensAdm.join(' | '));
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Notificações' }).click();
  await page.waitForTimeout(400);
  check('notificações abrem algo', (await page.getByRole('dialog').count()) + (await page.locator('[data-radix-popper-content-wrapper]').count()) > 0);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Minha conta' }).click();
  const itensConta = await page.getByRole('menuitem').allInnerTexts();
  check('menu da conta tem Sair e tema', itensConta.some(t => /Sair/.test(t)), itensConta.join(' | '));
  await page.keyboard.press('Escape');
});

await step('"Buscando…" termina quando a 1ª fase chega', async () => {
  await page.getByRole('button', { name: 'Atendimento', exact: true }).click();
  await page.locator('form', { has: busca }).getByRole('button', { name: 'Limpar' }).click();
  await page.waitForTimeout(500);
  await busca.fill('junta do carburador');
  const t0 = Date.now();
  await busca.press('Enter');
  await page.locator('article', { hasText: /JUNTA/i }).first().waitFor({ timeout: 20000 });
  const ate1 = Date.now() - t0;
  // A fase "por significado" pode levar vários segundos; o balcão não espera por ela para buscar de novo.
  await page.waitForTimeout(400);
  const texto = (await page.locator('form', { has: busca }).locator('button[type=submit]').first().innerText()).trim();
  check('com peças na tela o botão já está em "Buscar", não em "Buscando…"', texto === 'Buscar', `lista em ${ate1}ms, botão: ${texto}`);
  await esperarFim(40000);
});

await step('duas buscas seguidas não se misturam', async () => {
  await busca.fill('junta do carburador');
  await busca.press('Enter');
  await page.waitForTimeout(150);
  // Espera a resposta da busca NOVA (na simulação o servidor pode levar vários segundos, porque a busca anterior
  // ainda ocupa a fase "por significado"): sem ela não há o que comparar.
  const respostaDaNova = page.waitForResponse(r => /master-parts\/search/.test(r.url()) && /vela/.test(decodeURIComponent(r.url())), { timeout: 45000 });
  await busca.fill('vela de ignição');
  await busca.press('Enter');
  await respostaDaNova;
  await page.waitForTimeout(1500);
  await esperarFim(40000);
  await page.waitForTimeout(1500);
  // Compara os CÓDIGOS na tela com o que a API devolve para cada busca: determinístico, sem depender da fase
  // "por significado" (que na simulação usa uma IA de mentira e traz peças variadas).
  const codigosDaApi = q => page.evaluate(async q => {
    const r = await fetch('/api/master-parts/search?q=' + encodeURIComponent(q), { credentials: 'include' }).then(x => x.json());
    return (r.parts ?? []).map(p => String(p.partNumber).replace(/[^A-Za-z0-9]/g, '').toUpperCase());
  }, q);
  const primeira = new Set(await codigosDaApi('junta do carburador'));
  const segunda = new Set(await codigosDaApi('vela de ignição'));
  const naTela = (await page.locator('article button[aria-label^="Copiar código"]').evaluateAll(l => l.map(b => b.getAttribute('aria-label').replace('Copiar código ', '').replace(/[^A-Za-z0-9]/g, '').toUpperCase())));
  const daAnterior = naTela.filter(c => primeira.has(c) && !segunda.has(c));
  const daUltima = naTela.filter(c => segunda.has(c));
  check('a lista final é da ÚLTIMA busca: tem peças dela e nenhuma que só a anterior traria', daUltima.length > 0 && daAnterior.length === 0, `${daUltima.length} da última, ${daAnterior.length} só da anterior`);
});

await step('pergunta de óleo', async () => {
  await pesquisar('óleo 2 tempos', 'enter');
  await esperarFim(40000);
  const oleo = page.getByRole('region', { name: 'Óleo' });
  check('a pergunta de óleo mostra os quatro óleos da loja no topo', (await oleo.getByRole('button').count()) === 4, (await oleo.innerText().catch(() => '')).replace(/\s+/g, ' '));
  await oleo.getByRole('button', { name: /Óleo 2 tempos/ }).click();
  await page.waitForTimeout(500);
  check('o botão põe o óleo no orçamento como item avulso (sem código de peça)', (await page.locator('aside').last().innerText()).includes('Óleo 2 tempos'));
  check('a faixa de orçamento mostra só o nome do óleo, sem o código interno SRV-', !(await page.locator('aside').last().innerText()).includes('SRV-'));
  check('e o botão passa a dizer que já está no orçamento', await oleo.getByRole('button', { name: /Óleo 2 tempos · no orçamento/ }).isVisible());
  await shot(page, `${theme}-1366-atendimento-oleo`);
  await pesquisar('filtro de óleo', 'enter');
  await esperarFim(40000);
  check('"filtro de óleo" é peça: não oferece os botões de óleo', (await page.getByRole('region', { name: 'Óleo' }).count()) === 0);
});

await step('máquina sem repetir nos atalhos', async () => {
  await busca.fill('carburador 143RII');
  await busca.press('Enter');
  await page.getByRole('button', { name: /Roçadeira Husqvarna 143R II/ }).first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
  const iguais = await page.getByRole('button', { name: /Roçadeira Husqvarna 143R II/ }).count();
  check('a máquina aparece uma vez só entre os atalhos (o "recente" igual some)', iguais === 1, `${iguais}`);
});

await step('sino só do administrador', async () => {
  check('o administrador vê o sino', (await page.getByRole('button', { name: 'Notificações' }).count()) === 1);
  // Balcão: entra por API, em outro contexto, e conta as consultas às notificações.
  const outro = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  const pagina = await outro.newPage();
  const consultas = [];
  pagina.on('request', r => { if (/\/api\/notifications/.test(r.url())) consultas.push(r.url()); });
  const entrada = await pagina.request.post(BASE + '/api/login', { data: { email: 'mecanico.e2e@cognivault.local', password: 'CogniVault-E2E-2026!' }, headers: { Origin: BASE } });
  const eu = (await (await pagina.request.get(BASE + '/api/me')).json()).user;
  await outro.addInitScript(u => { localStorage.setItem('cognivault_tenant', u.tenantId); localStorage.setItem('cognivault_role', u.role); localStorage.setItem('cognivault_email', u.email); }, eu);
  await pagina.goto(BASE + '/dashboard');
  await pagina.getByPlaceholder(SEARCH).waitFor({ timeout: 20000 });
  await pagina.waitForTimeout(2500);
  check('o balcão entra normalmente', entrada.ok());
  check('o balcão NÃO vê o sino', (await pagina.getByRole('button', { name: 'Notificações' }).count()) === 0);
  check('o balcão nem consulta as notificações (menos uma chamada por minuto ao servidor)', consultas.length === 0, consultas.join(' | '));
  await outro.close();
});

await finish(browser, errors);
