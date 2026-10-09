// ABA CONSERTO (pedido do dono, 2026-10-09): o orçamento de conserto da loja ("ORÇAMENTO DAV ####.xlsx": código, descrição, qtde, valor, prazo POR LINHA, mão de obra, total),
// numa aba SEPARADA do Atendimento (cesta própria, sem escolha "peças ou conserto"), com o Nº da OS digitado e a pasta dos já feitos, um por OS.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/conserto.mjs [tema]
import { open, check, step, finish, shot, confirmar, sqlSim, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

await page.addInitScript(() => {
  window.__aberto = [];
  window.open = (url, ...resto) => { window.__aberto.push(String(url)); return { closed: false, close() {}, focus() {}, location: {} }; };
});

const api = path => page.evaluate(async p => (await fetch(p, { credentials: 'include' })).json(), path);
const base = () => new URL(page.url()).origin;
const ir = async caminho => { await page.goto(base() + caminho); await page.waitForTimeout(1200); };
const textoDoPdf = () => page.evaluate(async () => {
  const frame = document.querySelector('iframe[title="Prévia do PDF do orçamento"]');
  const url = frame?.getAttribute('src')?.split('#')[0];
  if (!url) return null;
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bruto = '';
  for (const byte of bytes) bruto += String.fromCharCode(byte);
  return bruto;
});

// Estado limpo: nenhum rascunho, nenhum orçamento de teste, e o cache do navegador sem a cesta do conserto (o app só a grava na aba).
const limpar = async () => {
  sqlSim(`DELETE FROM "Quote" WHERE "status" = 'DRAFT' OR ("kind" = 'REPAIR' AND "docNumber" IN ('59600', '59601'))`);
  await page.evaluate(() => ['cognivault_repair_cart', 'cognivault_repair_draft_options', 'cognivault_repair_history', 'cognivault_quote_cart', 'cognivault_quote_draft_options'].forEach(k => localStorage.removeItem(k)));
};

try {
  await limpar();
  await ir('/conserto');
  await page.getByRole('heading', { name: 'Conserto', level: 1 }).waitFor({ timeout: 20000 });
  const editor = page.getByRole('region', { name: 'Orçamento de conserto' });
  const codigo = editor.getByLabel('Código da peça (opcional)');
  const nome = editor.getByLabel('Descrição do serviço ou item');
  const quantidade = editor.getByLabel('Quantidade', { exact: true });
  const valor = editor.getByLabel('Valor unitário (R$)');
  const prazoNovo = editor.getByLabel('Prazo da nova linha');
  const status = editor.getByRole('status').filter({ hasText: /Achei|Não achei|Procurando/ });
  const linhas = () => editor.getByRole('button', { name: /^Remover / });

  await step('A aba é separada e simples: sem escolher "Peças ou Conserto", OS em branco, pagamento sem PIX', async () => {
    check('"Conserto" está na barra de abas e o endereço é /conserto', (await page.getByRole('link', { name: 'Conserto' }).or(page.getByRole('button', { name: 'Conserto', exact: true })).count()) >= 1 && new URL(page.url()).pathname === '/conserto' && /^Conserto · /.test(await page.title()));
    check('NÃO existe seletor "Peças | Conserto" nem aviso de tipo', (await page.getByRole('group', { name: 'Tipo do orçamento' }).count()) === 0 && (await page.getByRole('button', { name: 'Peças', exact: true }).count()) === 0);
    check('o Nº da OS começa em branco', (await editor.getByLabel('Nº da OS', { exact: true }).inputValue()) === '');
    check('a linha de entrada já está pronta (código, descrição, quantidade, valor, prazo)', await codigo.isVisible() && await nome.isVisible() && await quantidade.isVisible() && await valor.isVisible() && await prazoNovo.isVisible());
    const pagamento = editor.getByRole('group', { name: 'Pagamento' });
    check('pagamento: À vista, 30 dias e Outro, nada marcado no começo', (await pagamento.getByRole('button').allInnerTexts()).join('|') === 'À vista|30 dias|Outro' && (await pagamento.locator('[aria-pressed="true"]').count()) === 0);
    check('não há "PIX" nem "5%" em lugar nenhum da aba', !/PIX|5%/.test(await page.locator('main, body').first().innerText()));
    check('os botões de enviar ficam desabilitados com o orçamento vazio', await editor.getByRole('button', { name: /^Enviar no WhatsApp/ }).isDisabled() && await editor.getByRole('button', { name: 'PDF', exact: true }).isDisabled());
    const ordem = await page.evaluate(() => {
      const os = document.getElementById('repair-os'), cliente = document.getElementById('repair-customer'), entrada = document.getElementById('repair-entry-code');
      const antes = (a, b) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return antes(os, cliente) && antes(cliente, entrada);
    });
    check('a ordem do Tab é a da tela: OS → cliente → linhas → entrada', ordem);
    await shot(page, `${theme}-1366-conserto-vazia`);
  });

  await step('Monta o orçamento como a planilha: peça de outro fornecedor, peça Husqvarna pelo código (escrito de qualquer jeito) e mão de obra', async () => {
    await codigo.fill('VI 25463');
    await nome.fill('JOGO DE JUNTAS');
    await valor.fill('20');
    await valor.press('Enter');
    check('Enter na linha de entrada adiciona a peça e volta o cursor para o código', (await linhas().count()) === 1 && await codigo.evaluate(el => el === document.activeElement));
    check('a linha de entrada ficou limpa', (await codigo.inputValue()) === '' && (await nome.inputValue()) === '' && (await valor.inputValue()) === '' && (await quantidade.inputValue()) === '1');
    await codigo.fill('506-744-201');
    await status.filter({ hasText: /Achei no cadastro da loja/ }).waitFor({ timeout: 15000 });
    check('código Husqvarna: a descrição e o valor vêm do cadastro', /COBERTURA/.test(await nome.inputValue()) && Math.abs(Number(await valor.inputValue()) - 10.87) < 0.01);
    await valor.press('Enter');
    await editor.getByRole('button', { name: 'Mão de obra' }).click();
    check('o botão "Mão de obra" preenche a descrição e leva o cursor para o valor', (await nome.inputValue()) === 'Mão de obra' && await valor.evaluate(el => el === document.activeElement));
    await valor.fill('220');
    await valor.press('Enter');
    await page.waitForTimeout(800);
    check('as três linhas entraram', (await linhas().count()) === 3);
    check('o total é a soma (20 + 10,87 + 220 = R$ 250,87)', /R\$\s*250,87/.test(await editor.innerText()));
    check('a mão de obra entra SEM prazo de peça; as peças com "Pronta entrega" (o padrão da linha de entrada)', (await editor.getByLabel('Prazo de Mão de obra').inputValue()) === '' && (await editor.getByLabel('Prazo de JOGO DE JUNTAS').inputValue()) === 'NOW');
  });

  await step('Entrada ruim não quebra: descrição vazia, quantidade zero, valor negativo, texto enorme', async () => {
    await valor.fill('5');
    await valor.press('Enter');
    check('sem descrição, Enter não adiciona e o cursor vai para a descrição', (await linhas().count()) === 3 && await nome.evaluate(el => el === document.activeElement));
    await nome.fill('PEÇA DE TESTE');
    await quantidade.fill('0');
    await valor.fill('-3');
    await valor.press('Enter');
    check('quantidade 0 vira 1 e valor negativo fica sem valor', (await linhas().count()) === 4 && (await editor.getByLabel('Preço unitário de PEÇA DE TESTE').inputValue()) === '');
    await nome.fill('X'.repeat(600));
    await valor.fill('1');
    await valor.press('Enter');
    await page.waitForTimeout(500);
    check('descrição enorme é aceita sem travar a tela', (await linhas().count()) === 5);
    await editor.getByRole('button', { name: 'Remover PEÇA DE TESTE' }).click();
    await editor.getByRole('button', { name: /^Remover X{50}/ }).click();
    await page.waitForTimeout(500);
    check('as linhas de teste saem pelo ×', (await linhas().count()) === 3, String(await linhas().count()));
  });

  await step('Prazo POR LINHA, como na planilha', async () => {
    await editor.getByLabel('Prazo de JOGO DE JUNTAS').selectOption('ORDER');
    await editor.getByLabel('Prazo de COBERTURA DO CARBURADOR').selectOption('NOW');
    await page.waitForTimeout(400);
    check('cada linha guarda o seu prazo', (await editor.getByLabel('Prazo de JOGO DE JUNTAS').inputValue()) === 'ORDER' && (await editor.getByLabel('Prazo de COBERTURA DO CARBURADOR').inputValue()) === 'NOW');
  });

  await step('OS, cliente, pagamento e desconto (só se negociado)', async () => {
    await editor.getByLabel('Nº da OS', { exact: true }).fill('59600');
    await editor.getByLabel('Cliente', { exact: true }).fill('Cliente de teste');
    const pagamento = editor.getByRole('group', { name: 'Pagamento' });
    await pagamento.getByRole('button', { name: 'Outro' }).click();
    await editor.getByLabel('Condição de pagamento (escreva)').fill('50% na entrada e 50% em 15 dias');
    await pagamento.getByRole('button', { name: 'À vista' }).click();
    check('À vista marca o botão e troca o texto escrito', (await pagamento.getByRole('button', { name: 'À vista' }).getAttribute('aria-pressed')) === 'true');
    const desconto = editor.getByLabel('Desconto (%)');
    check('o desconto começa vazio: nenhum desconto automático', (await desconto.inputValue()) === '' && !/Desconto \(/.test(await editor.innerText()));
    await desconto.fill('7');
    await page.waitForTimeout(400);
    check('desconto digitado calcula na hora (7% de 250,87 = 233,31)', /Desconto \(7%\)/.test(await editor.innerText()) && /R\$\s*233,31/.test(await editor.innerText()), (await editor.innerText()).replace(/\s+/g, ' ').slice(-120));
    await desconto.fill('');
    await page.waitForTimeout(300);
    check('apagar o campo volta a sem desconto', !/Desconto \(/.test(await editor.innerText()));
  });

  await step('A prévia do PDF: OS, Ref. de conserto, pagamento sem PIX, prazo por linha e nenhum código', async () => {
    await editor.getByRole('button', { name: 'Prévia' }).click();
    const previa = page.getByRole('dialog', { name: 'Orçamento para o cliente' });
    await previa.getByTitle('Prévia do PDF do orçamento').waitFor({ timeout: 20000 });
    await page.waitForTimeout(1200);
    const pdf = (await textoDoPdf()) ?? '';
    check('o PDF leva "OS:" e o número', pdf.includes('OS:') && pdf.includes('59600'));
    check('a Ref. é "Orçamento de Conserto"', pdf.includes('Orçamento de Conserto'));
    check('o pagamento é "À vista" e não há PIX', pdf.includes('À vista') && !/PIX/.test(pdf));
    check('a coluna PRAZO existe, com o prazo de cada linha', pdf.includes('PRAZO') && pdf.includes('7 a 10 dias') && pdf.includes('Pronta entrega'));
    check('com prazos diferentes, as observações não afirmam pronta entrega nem encomenda', !/Peça em pronta entrega|Peça sob encomenda/.test(pdf));
    check('NENHUM código vai ao cliente', !/VI25463|VI 25463|506744201/.test(pdf));
    check('a mão de obra e as peças aparecem pelo nome', pdf.includes('JOGO DE JUNTAS') && /M.O DE OBRA|Mão de obra/i.test(pdf));
    await shot(page, `${theme}-1366-conserto-previa`);
    await previa.getByRole('button', { name: 'Fechar' }).click();
  });

  await step('WhatsApp: título de conserto, OS, pagamento, prazo da linha, sem "Peças originais" e sem código', async () => {
    await editor.getByRole('button', { name: /^Enviar no WhatsApp/ }).click();
    await page.waitForTimeout(800);
    const url = await page.evaluate(() => window.__aberto.at(-1) ?? '');
    const texto = decodeURIComponent(url.split('text=')[1] ?? '');
    check('abriu o WhatsApp com a mensagem', url.startsWith('https://wa.me/') && texto.length > 40);
    check('título de conserto e OS', texto.includes('*Orçamento de conserto · Vardão Máquinas*') && texto.includes('OS: 59600'));
    check('pagamento À vista, sem PIX', texto.includes('Pagamento: À vista') && !/PIX|5%/.test(texto));
    check('o prazo da linha aparece', texto.includes('Prazo: 7 a 10 dias') && texto.includes('Prazo: Pronta entrega'));
    check('não diz "Peças originais" e não leva código', !/Peças originais/.test(texto) && !/VI25463|506744201/.test(texto));
  });

  await step('A pasta: um por OS, o mesmo número NÃO cria cópia, e a busca acha pelo número', async () => {
    await page.waitForTimeout(1500);
    const pasta = page.getByRole('complementary', { name: 'Pasta de orçamentos de conserto' });
    check('a pasta mostra "OS 59600"', await pasta.getByRole('button', { name: /OS 59600/ }).isVisible());
    await editor.getByRole('button', { name: 'PDF', exact: true }).click();
    await editor.getByRole('button', { name: /^Enviar no WhatsApp/ }).click();
    await page.waitForTimeout(2500);
    const lista = await api('/api/quotes?kind=REPAIR&q=59600&take=50');
    check('depois de PDF e dois WhatsApp há UM orçamento da OS 59600 (não cópias)', lista.total === 1, String(lista.total));
    const guardado = lista.quotes[0];
    check('guardou tipo, número, pagamento e o prazo de cada linha', guardado?.kind === 'REPAIR' && guardado?.docNumber === '59600' && guardado?.paymentMethod === 'À vista' && guardado.items.some(i => i.leadTime === '7 a 10 dias') && guardado.items.some(i => i.leadTime === 'Pronta entrega'), JSON.stringify({ p: guardado?.paymentMethod, l: guardado?.items?.map(i => i.leadTime) }));
    await pasta.getByLabel('Buscar na pasta de conserto').fill('5960');
    await page.waitForTimeout(900);
    check('buscar "5960" acha a OS 59600', await pasta.getByRole('button', { name: /OS 59600/ }).isVisible());
    await pasta.getByLabel('Buscar na pasta de conserto').fill('00000');
    await page.waitForTimeout(900);
    check('um número que não existe diz que não achou', (await pasta.getByRole('button', { name: /OS 59600/ }).count()) === 0 && /Nenhum orçamento/.test(await pasta.innerText()));
    await pasta.getByLabel('Buscar na pasta de conserto').fill('');
    await page.waitForTimeout(900);
  });

  await step('SEPARADA do Atendimento: o que se monta aqui não aparece lá, e o contrário', async () => {
    const conserto = await api('/api/quotes/draft?kind=REPAIR');
    const pecas = await api('/api/quotes/draft');
    check('o servidor guarda duas cestas diferentes (conserto com 3 linhas, peças vazia)', (conserto.quote ?? conserto).items.length === 3 && (pecas.quote ?? pecas).items.length === 0 && (conserto.quote ?? conserto).id !== (pecas.quote ?? pecas).id);
    await ir('/atendimento');
    const busca = page.getByPlaceholder(SEARCH);
    await busca.fill('carburador 143RII');
    await busca.press('Enter');
    await page.getByRole('button', { name: /^\+ Orçamento/ }).first().waitFor({ timeout: 40000 });
    await page.getByRole('button', { name: /^\+ Orçamento/ }).first().click();
    await page.waitForTimeout(1500);
    const depois = await api('/api/quotes/draft');
    check('peça adicionada no Atendimento fica só na cesta de peças (tipo PARTS)', (depois.quote ?? depois).items.length === 1 && (depois.quote ?? depois).kind === 'PARTS');
    await page.getByRole('button', { name: 'Revisar orçamento' }).click();
    const gaveta = page.getByRole('dialog').first();
    await gaveta.waitFor();
    check('o orçamento de PEÇAS não tem as linhas do conserto (só a peça adicionada)', (await gaveta.getByRole('button', { name: /^Remover / }).count()) === 1);
    check('e não tem mão de obra, serviço, nem OS', !/Mão de obra|servi[çc]o|Nº da OS/i.test(await gaveta.innerText()));
    await page.keyboard.press('Escape');
    await ir('/conserto');
    await page.getByRole('heading', { name: 'Conserto', level: 1 }).waitFor();
    check('voltando para o Conserto, as 3 linhas continuam lá e a peça do Atendimento não veio junto', (await linhas().count()) === 3 && (await editor.getByLabel('Nº da OS', { exact: true }).inputValue()) === '59600');
    const conserto2 = await api('/api/quotes/draft?kind=REPAIR');
    check('a cesta de conserto no servidor continua com 3 linhas e do tipo REPAIR', (conserto2.quote ?? conserto2).items.length === 3 && (conserto2.quote ?? conserto2).kind === 'REPAIR');
  });

  await step('Novo orçamento limpa só o conserto e a pasta reabre o que foi feito, com tudo', async () => {
    await editor.getByRole('button', { name: 'Novo orçamento' }).click();
    await confirmar(page, 'Começar novo');
    await page.waitForTimeout(1000);
    check('limpou a cesta, a OS e o cliente', (await linhas().count()) === 0 && (await editor.getByLabel('Nº da OS', { exact: true }).inputValue()) === '' && (await editor.getByLabel('Cliente', { exact: true }).inputValue()) === '');
    const pecas = await api('/api/quotes/draft');
    check('a cesta de peças do Atendimento NÃO foi limpa', (pecas.quote ?? pecas).items.length === 1);
    await page.getByRole('complementary', { name: 'Pasta de orçamentos de conserto' }).getByRole('button', { name: /OS 59600/ }).click();
    await page.waitForTimeout(1500);
    check('as 3 linhas, a OS, o cliente e o pagamento voltaram', (await linhas().count()) === 3 && (await editor.getByLabel('Nº da OS', { exact: true }).inputValue()) === '59600' && (await editor.getByLabel('Cliente', { exact: true }).inputValue()) === 'Cliente de teste' && (await editor.getByRole('group', { name: 'Pagamento' }).getByRole('button', { name: 'À vista' }).getAttribute('aria-pressed')) === 'true');
    check('o prazo de cada linha voltou', (await editor.getByLabel('Prazo de JOGO DE JUNTAS').inputValue()) === 'ORDER' && (await editor.getByLabel('Prazo de COBERTURA DO CARBURADOR').inputValue()) === 'NOW');
    await editor.getByLabel('Preço unitário de JOGO DE JUNTAS').fill('25');
    await editor.getByRole('button', { name: /^Enviar no WhatsApp/ }).click();
    await page.waitForTimeout(2500);
    const mesma = await api('/api/quotes?kind=REPAIR&q=59600&take=50');
    check('mudar o preço e enviar de novo atualiza a MESMA OS (R$ 25,00 na junta), sem cópia', mesma.total === 1 && mesma.quotes[0].items.some(i => i.name === 'JOGO DE JUNTAS' && i.unitPrice === 25));
  });

  await step('A lista de Orçamentos separa os tipos, e "Retomar" um conserto abre a aba Conserto', async () => {
    await ir('/orcamentos');
    await page.getByRole('heading', { name: 'Orçamentos', level: 1 }).waitFor();
    const tipo = page.getByRole('group', { name: 'Tipo' });
    await tipo.getByRole('button', { name: 'Conserto' }).click();
    await page.waitForTimeout(1200);
    check('o filtro Conserto mostra a OS com o rótulo', /Conserto · OS 59600/.test(await page.locator('main, body').first().innerText()));
    await tipo.getByRole('button', { name: 'Peças' }).click();
    await page.waitForTimeout(1200);
    check('o filtro Peças não mostra o conserto', !/Conserto · OS 59600/.test(await page.locator('main, body').first().innerText()));
    await tipo.getByRole('button', { name: 'Conserto' }).click();
    await page.waitForTimeout(1200);
    await page.getByRole('button', { name: 'Retomar' }).first().click();
    await page.waitForURL(/\/conserto/, { timeout: 15000 });
    await page.getByRole('heading', { name: 'Conserto', level: 1 }).waitFor();
    await page.waitForTimeout(1500);
    check('abriu na aba Conserto, com a OS no editor', new URL(page.url()).pathname === '/conserto' && (await page.getByRole('region', { name: 'Orçamento de conserto' }).getByLabel('Nº da OS').inputValue()) === '59600');
    check('o endereço ficou limpo (sem ?os=)', !new URL(page.url()).search);
  });
} finally {
  await page.goto(base() + '/atendimento').catch(() => {});
  await limpar().catch(() => {});
}

await finish(browser, errors);
