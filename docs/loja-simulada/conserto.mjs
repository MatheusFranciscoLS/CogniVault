// ABA CONSERTO (pedido do dono, 2026-10-09): os orçamentos de conserto da loja hoje são planilhas "ORÇAMENTO DAV 59600.xlsx" (código, descrição, qtde, valor, prazo POR LINHA,
// mão de obra, total). A aba monta o mesmo orçamento, com peças de qualquer fornecedor, "Nº da OS" digitado (em branco por padrão) e a pasta dos já feitos, um por OS.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/conserto.mjs [tema]
import { open, check, step, finish, shot, clearQuote, confirmar } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

await page.addInitScript(() => {
  window.__aberto = [];
  window.open = (url, ...resto) => { window.__aberto.push(String(url)); return { closed: false, close() {}, focus() {}, location: {} }; };
});

const api = path => page.evaluate(async p => (await fetch(p, { credentials: 'include' })).json(), path);
const textoDoPdf = () => page.evaluate(async () => {
  const frame = document.querySelector('iframe[title="Prévia do PDF do orçamento"]');
  const url = frame?.getAttribute('src')?.split('#')[0];
  if (!url) return null;
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bruto = '';
  for (const byte of bytes) bruto += String.fromCharCode(byte);
  return bruto;
});

const limpar = async () => {
  await clearQuote(page).catch(() => {});
  // Apaga os orçamentos de conserto de teste (OS 59600 e 59601) para o roteiro poder rodar de novo.
  const lista = await api('/api/quotes?kind=REPAIR&take=100').catch(() => null);
  for (const quote of lista?.quotes ?? []) {
    if (['59600', '59601'].includes(quote.docNumber)) await page.evaluate(id => fetch(`/api/quotes/${id}`, { method: 'DELETE', credentials: 'include' }), quote.id);
  }
};

try {
  await page.goto(new URL('/atendimento', page.url()).href);
  await limpar();
  await page.goto(new URL('/conserto', page.url()).href);
  await page.getByRole('heading', { name: 'Conserto', level: 1 }).waitFor({ timeout: 20000 });
  await page.waitForTimeout(1200);

  await step('A aba existe, tem endereço próprio e começa no modo conserto, com a OS em branco', async () => {
    check('"Conserto" está na barra de abas', (await page.getByRole('link', { name: 'Conserto' }).or(page.getByRole('button', { name: 'Conserto', exact: true })).count()) >= 1);
    check('o endereço é /conserto e o título da aba do navegador diz Conserto', new URL(page.url()).pathname === '/conserto' && /^Conserto · /.test(await page.title()));
    check('com a cesta vazia já é conserto (campo da OS à mostra) e o seletor de tipo não aparece', (await page.getByLabel('Nº da OS').isVisible()) && (await page.getByRole('group', { name: 'Tipo do orçamento' }).count()) === 0);
    check('o formulário de item já está aberto (sem fechar)', await page.getByLabel('Código da peça (opcional)').isVisible());
    check('não há botão de fechar o formulário nem Cancelar', (await page.getByRole('button', { name: /^(Cancelar|Concluir|Fechar)$/ }).count()) === 0);
    check('o campo Nº da OS existe e está em branco', (await page.getByLabel('Nº da OS').inputValue()) === '');
    await shot(page, `${theme}-1366-conserto-vazia`);
  });

  await step('Monta o orçamento como a planilha: peça de outro fornecedor, peça Husqvarna pelo código, mão de obra', async () => {
    const codigo = page.getByLabel('Código da peça (opcional)');
    const nome = page.getByLabel('Descrição do serviço ou item');
    const preco = page.getByLabel('Preço (R$)');
    await codigo.fill('VI 25463');
    await nome.fill('JOGO DE JUNTAS');
    await preco.fill('20');
    await preco.press('Enter');
    await codigo.fill('506-744-201');
    await page.getByRole('status').filter({ hasText: /Achei no cadastro da loja/ }).waitFor({ timeout: 15000 });
    await preco.press('Enter');
    await nome.fill('MÃO DE OBRA');
    await preco.fill('220');
    await preco.press('Enter');
    await page.waitForTimeout(800);
    check('as três linhas entraram', (await page.getByRole('button', { name: /^Remover / }).count()) === 3);
    check('com itens, o seletor aparece e o tipo é Conserto (gravado no primeiro item)', (await page.getByRole('group', { name: 'Tipo do orçamento' }).getByRole('button', { name: 'Conserto' }).getAttribute('aria-pressed')) === 'true');
    check('o total é a soma (20 + 10,87 + 220 = R$ 250,87)', /R\$\s*250,87/.test(await page.locator('footer').innerText()));
  });

  await step('Prazo POR LINHA, como na planilha (7 DIAS numas, IMEDIATO noutras)', async () => {
    await page.getByLabel('Prazo de JOGO DE JUNTAS').selectOption('ORDER');
    await page.getByLabel('Prazo de COBERTURA DO CARBURADOR').selectOption('NOW');
    await page.waitForTimeout(500);
    check('a linha 1 ficou em Encomenda e a 2 em Pronta entrega', (await page.getByLabel('Prazo de JOGO DE JUNTAS').inputValue()) === 'ORDER' && (await page.getByLabel('Prazo de COBERTURA DO CARBURADOR').inputValue()) === 'NOW');
    check('a mão de obra segue sem prazo próprio', (await page.getByLabel('Prazo de MÃO DE OBRA').inputValue()) === '');
  });

  await step('OS e cliente', async () => {
    await page.getByLabel('Nº da OS').fill('59600');
    await page.getByPlaceholder('Nome do cliente').fill('Cliente de teste');
    await page.waitForTimeout(600);
    check('o número fica no campo', (await page.getByLabel('Nº da OS').inputValue()) === '59600');
  });

  await step('A prévia do PDF: OS, Ref. de conserto, prazo por linha, sem código', async () => {
    await page.getByRole('button', { name: 'Prévia' }).click();
    const previa = page.getByRole('dialog', { name: 'Orçamento para o cliente' });
    await previa.getByTitle('Prévia do PDF do orçamento').waitFor({ timeout: 20000 });
    await page.waitForTimeout(1200);
    const pdf = (await textoDoPdf()) ?? '';
    check('o PDF leva "OS:" e o número', pdf.includes('OS:') && pdf.includes('59600'));
    check('a Ref. é "Orçamento de Conserto"', pdf.includes('Orçamento de Conserto'));
    check('a coluna PRAZO existe e cada linha diz o seu (7 a 10 dias, Pronta entrega)', pdf.includes('PRAZO') && pdf.includes('7 a 10 dias') && pdf.includes('Pronta entrega'));
    check('com prazos diferentes, as observações não afirmam nem pronta entrega nem encomenda', !/Peça em pronta entrega|Peça sob encomenda/.test(pdf));
    check('NENHUM código vai ao cliente', !/VI25463|VI 25463|506744201/.test(pdf));
    check('a mão de obra e as peças aparecem pelo nome', pdf.includes('MÃO DE OBRA') && pdf.includes('JOGO DE JUNTAS'));
    await shot(page, `${theme}-1366-conserto-previa`);
    await previa.getByRole('button', { name: 'Fechar' }).click();
  });

  await step('WhatsApp: título de conserto, OS, prazo da linha, sem "Peças originais" e sem código', async () => {
    await page.getByRole('button', { name: /^Enviar no WhatsApp/ }).click();
    await page.waitForTimeout(800);
    const url = await page.evaluate(() => window.__aberto.at(-1) ?? '');
    const texto = decodeURIComponent(url.split('text=')[1] ?? '');
    check('abriu o WhatsApp com a mensagem', url.startsWith('https://wa.me/') && texto.length > 40);
    check('título de conserto e OS', texto.includes('*Orçamento de conserto · Vardão Máquinas*') && texto.includes('OS: 59600'));
    check('o prazo da linha aparece', texto.includes('Prazo: 7 a 10 dias') && texto.includes('Prazo: Pronta entrega'));
    check('não diz "Peças originais" e não leva código', !/Peças originais/.test(texto) && !/VI25463|506744201/.test(texto));
  });

  await step('A pasta: um por OS, o mesmo número NÃO cria cópia, e a busca acha pelo número', async () => {
    await page.waitForTimeout(1500);
    const pasta = page.getByRole('complementary', { name: 'Pasta de orçamentos de conserto' });
    check('a pasta mostra "OS 59600"', await pasta.getByRole('button', { name: /OS 59600/ }).isVisible());
    // PDF logo depois do WhatsApp com o MESMO número: continua um só.
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    await page.waitForTimeout(2500);
    const lista = await api('/api/quotes?kind=REPAIR&q=59600&take=50');
    check('depois de WhatsApp e PDF há UM orçamento da OS 59600 (não duas cópias)', lista.total === 1, String(lista.total));
    const arquivado = lista.quotes[0];
    check('guardou o tipo, o número e o prazo de cada linha', arquivado?.kind === 'REPAIR' && arquivado?.docNumber === '59600' && arquivado.items.some(i => i.leadTime === '7 a 10 dias') && arquivado.items.some(i => i.leadTime === 'Pronta entrega'), JSON.stringify(arquivado?.items?.map(i => i.leadTime)));
    await pasta.getByLabel('Buscar na pasta de conserto').fill('5960');
    await page.waitForTimeout(900);
    check('buscar "5960" acha a OS 59600', await pasta.getByRole('button', { name: /OS 59600/ }).isVisible());
    await pasta.getByLabel('Buscar na pasta de conserto').fill('00000');
    await page.waitForTimeout(900);
    check('buscar um número que não existe diz que não achou', (await pasta.getByRole('button', { name: /OS 59600/ }).count()) === 0 && /Nenhum orçamento/.test(await pasta.innerText()));
    await pasta.getByLabel('Buscar na pasta de conserto').fill('');
    await page.waitForTimeout(900);
  });

  await step('Esvaziar e reabrir da pasta: itens, OS, cliente e prazo por linha voltam', async () => {
    await page.getByRole('button', { name: 'Esvaziar' }).click();
    await confirmar(page, 'Esvaziar');
    await page.waitForTimeout(1000);
    check('esvaziar limpou a cesta e o número da OS', (await page.getByRole('button', { name: /^Remover / }).count()) === 0 && (await page.getByLabel('Nº da OS').inputValue()) === '');
    check('a aba continua em modo conserto para o próximo (o campo da OS segue à mostra)', await page.getByLabel('Nº da OS').isVisible());
    await page.getByRole('complementary', { name: 'Pasta de orçamentos de conserto' }).getByRole('button', { name: /OS 59600/ }).click();
    await page.waitForTimeout(1500);
    check('as 3 linhas voltaram', (await page.getByRole('button', { name: /^Remover / }).count()) === 3);
    check('a OS voltou', (await page.getByLabel('Nº da OS').inputValue()) === '59600');
    check('o prazo de cada linha voltou', (await page.getByLabel('Prazo de JOGO DE JUNTAS').inputValue()) === 'ORDER' && (await page.getByLabel('Prazo de COBERTURA DO CARBURADOR').inputValue()) === 'NOW');
    check('a gaveta lateral NÃO abriu por cima da página', (await page.getByRole('dialog').count()) === 0);
  });

  await step('Mudar o preço e salvar a mesma OS atualiza o mesmo arquivo; outra OS cria outro', async () => {
    await page.getByLabel('Preço unitário de JOGO DE JUNTAS').fill('25');
    await page.getByRole('button', { name: /^Enviar no WhatsApp/ }).click();
    await page.waitForTimeout(2500);
    const mesma = await api('/api/quotes?kind=REPAIR&q=59600&take=50');
    check('continua UM da OS 59600, agora com R$ 25,00 na junta', mesma.total === 1 && mesma.quotes[0].items.some(i => i.name === 'JOGO DE JUNTAS' && i.unitPrice === 25), `${mesma.total}`);
    await page.getByLabel('Nº da OS').fill('59601');
    await page.getByRole('button', { name: 'PDF', exact: true }).click();
    await page.waitForTimeout(2500);
    const duas = await api('/api/quotes?kind=REPAIR&take=50');
    check('com outro número há dois orçamentos de conserto', duas.quotes.filter(q => ['59600', '59601'].includes(q.docNumber)).length === 2);
  });

  await step('Orçamentos (a lista geral) separa por tipo e acha pela OS', async () => {
    await page.goto(new URL('/orcamentos', page.url()).href);
    await page.getByRole('heading', { name: 'Orçamentos', level: 1 }).waitFor();
    await page.waitForTimeout(1200);
    const tipo = page.getByRole('group', { name: 'Tipo' });
    await tipo.getByRole('button', { name: 'Conserto' }).click();
    await page.waitForTimeout(1200);
    const corpo = await page.locator('main, body').first().innerText();
    check('o filtro Conserto mostra a OS 59600 com o rótulo', /Conserto · OS 59600/.test(corpo));
    await tipo.getByRole('button', { name: 'Peças' }).click();
    await page.waitForTimeout(1200);
    check('o filtro Peças não mostra o conserto', !/Conserto · OS 59600/.test(await page.locator('main, body').first().innerText()));
    await tipo.getByRole('button', { name: 'Todos' }).click();
    await page.getByLabel(/Cliente, OS, telefone/).fill('59601');
    await page.getByLabel(/Cliente, OS, telefone/).press('Enter');
    await page.waitForTimeout(1200);
    check('buscar pela OS 59601 acha o orçamento', /OS 59601/.test(await page.locator('main, body').first().innerText()));
  });

  await step('Esvaziar no Atendimento volta para Peças; peças em andamento NÃO viram conserto sozinhas ao abrir a aba', async () => {
    // Esvazia pelo próprio site (o app grava o estado dele no servidor ao recarregar; limpar por fora desfaria a limpeza).
    await page.goto(new URL('/conserto', page.url()).href);
    await page.getByRole('button', { name: 'Esvaziar' }).waitFor({ timeout: 20000 });
    await page.getByRole('button', { name: 'Esvaziar' }).click();
    await confirmar(page, 'Esvaziar');
    await page.waitForTimeout(800);
    await page.goto(new URL('/atendimento', page.url()).href);
    await page.waitForTimeout(1500);
    const busca = page.getByPlaceholder(/Código, peça ou modelo|Peça, código ou pergunta/);
    await busca.fill('carburador 143RII');
    await busca.press('Enter');
    await page.getByRole('button', { name: /^\+ Orçamento/ }).first().waitFor({ timeout: 40000 });
    await page.getByRole('button', { name: 'Revisar orçamento' }).count();
    await page.getByRole('button', { name: /^\+ Orçamento/ }).first().click();
    await page.waitForTimeout(1500);
    await page.goto(new URL('/conserto', page.url()).href);
    await page.getByRole('heading', { name: 'Conserto', level: 1 }).waitFor();
    await page.waitForTimeout(1500);
    const tipo = page.getByRole('group', { name: 'Tipo do orçamento' });
    const rascunho = await api('/api/quotes/draft');
    check('o orçamento de peças em andamento continua Peças', (await tipo.getByRole('button', { name: 'Peças' }).getAttribute('aria-pressed')) === 'true', `servidor: ${rascunho?.quote?.kind ?? rascunho?.kind}, itens ${(rascunho?.quote?.items ?? rascunho?.items ?? []).length}; local: ${await page.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage).filter(([k]) => /option|quote/i.test(k)))).slice(0, 300))}`);
    await tipo.getByRole('button', { name: 'Conserto' }).click();
    await page.waitForTimeout(500);
    check('o seletor troca para Conserto e o campo da OS aparece', await page.getByLabel('Nº da OS').isVisible());
    await tipo.getByRole('button', { name: 'Peças' }).click();
    await page.waitForTimeout(500);
    check('voltando para Peças o campo da OS some', (await page.getByLabel('Nº da OS').count()) === 0);
  });
} finally {
  await page.goto(new URL('/atendimento', page.url()).href).catch(() => {});
  await limpar().catch(() => {});
}

await finish(browser, errors);
