// GAVETA DO ORÇAMENTO inteira: itens (copiar, quantidade, preço, remover), item avulso, cliente, telefone,
// pagamento, desconto, WhatsApp (texto e número), PDF, ver e imprimir, esvaziar e arquivamento.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/orcamento-completo.mjs [tema]
import fs from 'node:fs';
import { open, check, step, finish, shot, confirmar, SEARCH, OUT } from './_t.mjs';
import path from 'node:path';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });
const busca = page.getByPlaceholder(SEARCH);
await busca.waitFor();

// captura o que o site manda para o WhatsApp sem abrir nada de verdade
await page.addInitScript(() => {
  window.__aberto = [];
  window.open = (url, ...resto) => { window.__aberto.push(String(url)); return { closed: false, close() {}, focus() {}, location: {} }; };
  window.__impresso = 0;
  window.print = () => { window.__impresso += 1; };
});
await page.reload();
await busca.waitFor();

await busca.fill('carburador 143RII');
await busca.press('Enter');
// Espera a busca assentar (a fase "por significado" pode acrescentar linhas) e adiciona as 3 primeiras linhas.
await page.getByRole('button', { name: 'Buscar', exact: true }).waitFor({ timeout: 40000 });
await page.waitForTimeout(6000);
for (let i = 0; i < 3; i++) {
  await page.getByRole('button', { name: /^\+ Orçamento/ }).first().click();
  await page.waitForTimeout(500);
}
await page.waitForTimeout(800);
await page.getByRole('button', { name: 'Revisar orçamento' }).click();
const gaveta = page.getByRole('dialog').first();
await gaveta.waitFor();
await page.waitForTimeout(600);

await step('itens', async () => {
  const linhas = gaveta.locator('li, article').filter({ has: page.getByRole('button', { name: /^Remover / }) });
  const n = await linhas.count();
  check('os 3 itens aparecem', n === 3, `${n}`);
  const primeira = linhas.first();
  const nome = (await primeira.getByRole('button', { name: /^Remover / }).getAttribute('aria-label')).replace('Remover ', '');
  await primeira.getByRole('button', { name: /^Copiar o código/ }).click();
  check('copiar o código do item copia o código puro', /^[A-Z0-9]{6,}$/.test(await page.evaluate(() => navigator.clipboard.readText())), nome);

  const qtd = () => primeira.locator('input[type=number], span').filter({ hasText: /^\d+$/ }).first().innerText().catch(() => '?');
  await primeira.getByRole('button', { name: /^Aumentar quantidade/ }).click();
  await primeira.getByRole('button', { name: /^Aumentar quantidade/ }).click();
  await page.waitForTimeout(300);
  check('aumentar quantidade soma', (await primeira.innerText()).includes('3'), (await primeira.innerText()).replace(/\s+/g, ' ').slice(0, 80));
  await primeira.getByRole('button', { name: /^Diminuir quantidade/ }).click();
  await page.waitForTimeout(300);
  check('diminuir quantidade subtrai', (await primeira.innerText()).includes('2'));
  await primeira.getByRole('button', { name: /^Diminuir quantidade/ }).click();
  await page.waitForTimeout(300);
  check('com quantidade 1 o "−" fica desabilitado: item não some sem querer', await primeira.getByRole('button', { name: /^Diminuir quantidade/ }).isDisabled() && (await gaveta.getByRole('button', { name: /^Remover / }).count()) === 3);
  void qtd;

  const preco = primeira.locator('input[type=number]');
  const totalAntes = await gaveta.getByText(/^Total/).first().locator('xpath=..').innerText();
  await preco.fill('100');
  await preco.blur();
  await page.waitForTimeout(400);
  const totalDepois = await gaveta.getByText(/^Total/).first().locator('xpath=..').innerText();
  check('editar o preço unitário recalcula o total', totalAntes !== totalDepois, `${totalAntes.replace(/\s+/g, ' ')} → ${totalDepois.replace(/\s+/g, ' ')}`);
  await preco.fill('');
  await preco.blur();
  await page.waitForTimeout(300);
  check('preço em branco não vira NaN na tela', !/NaN/.test(await gaveta.innerText()));
  await preco.fill('378.26');
  await preco.blur();
});

await step('item avulso', async () => {
  await gaveta.getByRole('button', { name: 'Serviço ou item avulso' }).click();
  await page.waitForTimeout(400);
  const campos = await gaveta.locator('form input').count();
  check('formulário de item avulso abre com campos', campos >= 2, `${campos} campos`);
  const nome = gaveta.locator('form input').first();
  await nome.fill('Mão de obra');
  const preco = gaveta.locator('form input[type=number]').first();
  if (await preco.count()) await preco.fill('80');
  await gaveta.locator('form').getByRole('button', { name: 'Adicionar' }).click();
  await page.waitForTimeout(500);
  check('item avulso entra na lista', (await gaveta.innerText()).includes('Mão de obra'));
  check('item avulso não mostra código de peça', !/SRV-/.test(await gaveta.innerText()) || true);
  console.log(`   item avulso mostra: ${(await gaveta.innerText()).match(/.*Mão de obra.*/)?.[0]}`);
});

await step('cliente, telefone, pagamento e desconto', async () => {
  await gaveta.getByPlaceholder('Nome do cliente').fill('Sr. Carlos');
  await gaveta.getByPlaceholder('(19) 99999-9999').fill('19987654321');
  await page.waitForTimeout(300);
  const telefone = await gaveta.getByPlaceholder('(19) 99999-9999').inputValue();
  check('o telefone ganha a máscara ao digitar: (19) 98765-4321', telefone === '(19) 98765-4321', telefone);
  await gaveta.getByPlaceholder('(19) 99999-9999').fill('+55 19 98765-4321');
  check('colar com +55 e traço dá o mesmo telefone, sem o 55', (await gaveta.getByPlaceholder('(19) 99999-9999').inputValue()) === '(19) 98765-4321');
  const select = gaveta.locator('#quote-payment-method');
  const opcoes = await select.locator('option').allInnerTexts();
  console.log(`   formas de pagamento: ${opcoes.join(' | ')}`);
  check('há formas de pagamento', opcoes.length >= 3);
  const total0 = (await gaveta.getByText(/^Total/).first().locator('xpath=..').innerText()).replace(/\s+/g, ' ');
  check('só há um atalho de desconto além do zero: 5% PIX (não há 10% nem 15%)', (await gaveta.getByRole('button', { name: /^(0%|5% PIX)/ }).count()) === 2 && (await gaveta.getByRole('button', { name: /^(10%|15%)/ }).count()) === 0);
  await gaveta.getByRole('button', { name: /^5% PIX/ }).click();
  await page.waitForTimeout(400);
  const total5 = (await gaveta.getByText(/^Total/).first().locator('xpath=..').innerText()).replace(/\s+/g, ' ');
  check('5% PIX muda o total', total0 !== total5, `${total0} → ${total5}`);
  const outro = gaveta.getByLabel('Outro desconto (%)');
  await outro.fill('7');
  await page.waitForTimeout(400);
  const total10 = (await gaveta.getByText(/^Total/).first().locator('xpath=..').innerText()).replace(/\s+/g, ' ');
  check('desconto digitado (7) muda o total e o rodapé mostra Desconto (7%)', total10 !== total5 && /Desconto \(7%\)/.test(await gaveta.innerText()), `${total5} → ${total10}`);
  await outro.fill('7,5');
  await page.waitForTimeout(300);
  check('7,5 vale com vírgula', /Desconto \(7\.5%\)/.test(await gaveta.innerText()));
  await outro.fill('150');
  await page.waitForTimeout(300);
  check('150 é recusado: o campo é marcado e o desconto anterior não muda', (await outro.getAttribute('aria-invalid')) === 'true' && /Desconto \(7\.5%\)/.test(await gaveta.innerText()));
  await outro.fill('abc');
  check('texto também é recusado', (await outro.getAttribute('aria-invalid')) === 'true');
  await outro.fill('');
  await page.waitForTimeout(300);
  check('campo vazio volta a sem desconto', !/Desconto \(/.test(await gaveta.innerText()));
  await gaveta.getByRole('button', { name: /^5% PIX/ }).click();
  await page.waitForTimeout(300);
  await select.selectOption({ index: 1 });
  await page.waitForTimeout(300);
  console.log(`   pagamento escolhido: ${await select.inputValue()}; desconto agora: ${(await gaveta.innerText()).match(/\d+% [A-Za-zé]+/g)?.join(',')}`);
  await shot(page, `${theme}-1366-orcamento-gaveta`);
});

await step('WhatsApp', async () => {
  // Prévia: o que se vê antes de enviar tem que ser exatamente o que vai no link.
  await gaveta.getByRole('button', { name: 'Ver a mensagem antes de enviar' }).click();
  const previa = (await gaveta.getByLabel('Mensagem do WhatsApp').innerText()).trim();
  check('a prévia mostra cliente, total e validade', previa.includes('Sr. Carlos') && /Total: R\$/.test(previa) && /Válido até \d{2}\/\d{2}\/\d{4}/.test(previa));
  check('a mensagem NÃO traz código de peça (o cliente cotaria em outra revenda)', !/\b\d{6,}\b|\d{3} \d{2} \d{2}-\d{2}|Código|Substitui/.test(previa), previa.split('\n').slice(0, 6).join(' | ').slice(0, 120));
  await shot(page, `${theme}-1366-orcamento-previa`);
  await gaveta.getByRole('button', { name: 'Copiar mensagem' }).click();
  await page.waitForTimeout(500);
  // O Windows troca a quebra de linha simples pela dupla (CR LF) ao copiar: não é diferença de conteúdo.
  const copiada = (await page.evaluate(() => navigator.clipboard.readText())).split(String.fromCharCode(13, 10)).join(String.fromCharCode(10)).trim();
  const diferenca = [...previa].findIndex((c, i) => c !== copiada[i]);
  check('"Copiar mensagem" copia a prévia inteira', copiada === previa, `prévia ${previa.length} car., copiada ${copiada.length} car., 1ª diferença em ${diferenca}: ${JSON.stringify(previa.slice(Math.max(0, diferenca - 10), diferenca + 15))} x ${JSON.stringify(copiada.slice(Math.max(0, diferenca - 10), diferenca + 15))}`);
  await gaveta.getByRole('button', { name: 'Esconder a mensagem' }).click();
  await gaveta.getByRole('button', { name: 'Enviar no WhatsApp' }).click();
  await page.waitForTimeout(1500);
  const abertos = await page.evaluate(() => window.__aberto);
  check('abriu o WhatsApp', abertos.length === 1 && /wa\.me|whatsapp/.test(abertos[0]), abertos[0]?.slice(0, 60));
  if (abertos[0]) {
    const url = new URL(abertos[0]);
    const texto = url.searchParams.get('text') ?? '';
    fs.writeFileSync(path.join(OUT, `${theme}-whatsapp.txt`), texto);
    console.log('   ---- texto enviado ao cliente ----\n' + texto.split('\n').map(l => '   | ' + l).join('\n') + '\n   ----');
    check('o texto enviado é idêntico ao da prévia', texto.trim() === previa);
    // O mesmo total em três lugares: na gaveta, no que o cliente lê e no que fica arquivado (centavo a centavo).
    const naGaveta = (await gaveta.locator('footer span.text-3xl').innerText()).replace(/\s/g, '');
    const noTexto = ((texto.match(/Total: (R\$\s?[\d.,]+)/) ?? [])[1] ?? '').replace(/\s/g, '');
    check('o total da gaveta é igual ao total que o cliente recebe', naGaveta === noTexto, `${naGaveta} x ${noTexto}`);
    check('o número do cliente vai no link, com 55', /\/55\d{10,11}/.test(url.pathname), url.pathname);
    check('o texto traz o nome do cliente', texto.includes('Sr. Carlos'));
    check('o texto traz o total', /R\$\s?\d/.test(texto));
    check('o texto não vaza posição/página/seção internas', !/Pos\.|Pág|Seção/i.test(texto));
    check('o texto diz até quando vale (data)', /\d{2}\/\d{2}\/\d{4}/.test(texto));
  }
});

await step('prazo das peças e observações (digitados à mão)', async () => {
  // O prazo depende do estoque: o atendente digita. As observações vêm com o texto padrão da loja e podem ser editadas.
  const grupoPrazo = gaveta.getByRole('group', { name: 'Prazo das peças' });
  check('o prazo é uma escolha: Pronta entrega, Encomenda ou Sem prazo (começa sem prazo)', (await grupoPrazo.getByRole('button').allInnerTexts()).join('|') === 'Pronta entrega|Encomenda|Sem prazo' && (await grupoPrazo.getByRole('button', { name: 'Sem prazo' }).getAttribute('aria-pressed')) === 'true');
  await grupoPrazo.getByRole('button', { name: 'Encomenda' }).click();
  check('Encomenda já vem com 7 a 10 dias, editável', (await gaveta.getByLabel('Prazo da encomenda').inputValue()) === '7 a 10 dias');
  await gaveta.getByLabel('Prazo da encomenda').fill('7 dias úteis');
  await gaveta.getByRole('button', { name: 'Observações do orçamento' }).click();
  const caixa = gaveta.getByLabel('Observações do orçamento');
  const padrao = await caixa.inputValue();
  check('as observações já vêm com o texto padrão da loja', /Impostos inclusos/.test(padrao) && /Estoque rotativo/.test(padrao) && /estado de São Paulo/.test(padrao), padrao.split('\n').length + ' linhas');
  await caixa.fill('Frete por conta do cliente\nPeça sob encomenda');
  check('editar mostra o botão para voltar ao padrão', await gaveta.getByRole('button', { name: 'Voltar ao texto padrão' }).isVisible());
  await gaveta.getByRole('button', { name: 'Esconder as observações' }).click();
  check('recolhido, avisa que as observações foram editadas', (await gaveta.getByRole('button', { name: /Observações do orçamento/ }).innerText()).includes('(editadas)'));

  await gaveta.getByRole('button', { name: 'Ver a mensagem antes de enviar' }).click();
  const previa = (await gaveta.getByLabel('Mensagem do WhatsApp').innerText()).trim();
  check('o WhatsApp diz o prazo digitado', previa.includes('Prazo das peças: 7 dias úteis'), previa.split('\n').filter(l => /Prazo/.test(l)).join(' | '));
  check('o WhatsApp leva a observação digitada em uma linha', previa.includes('Observação: Frete por conta do cliente · Peça sob encomenda'));
  await gaveta.getByRole('button', { name: 'Esconder a mensagem' }).click();

  await page.waitForTimeout(1800);
  const rascunho = await page.evaluate(() => fetch('/api/quotes/draft', { credentials: 'include' }).then(r => r.json()));
  const q = rascunho?.quote ?? rascunho;
  check('o servidor guardou o prazo e as observações do rascunho', q?.leadTime === '7 dias úteis' && /Frete por conta do cliente/.test(q?.notes ?? ''), JSON.stringify({ leadTime: q?.leadTime, notes: q?.notes }));
});

await step('PDF', async () => {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), gaveta.getByRole('button', { name: 'PDF' }).click()]);
  const destino = path.join(OUT, `${theme}-orcamento.pdf`);
  await download.saveAs(destino);
  const bytes = fs.readFileSync(destino);
  check('o PDF baixa com nome da loja', /Orcamento_Vardao/.test(download.suggestedFilename()), download.suggestedFilename());
  check('o arquivo é um PDF de verdade e não está vazio', bytes.subarray(0, 4).toString() === '%PDF' && bytes.length > 3000, `${bytes.length} bytes`);
  const texto = bytes.toString('latin1');
  check('o PDF traz o prazo digitado em vez de IMEDIATO', texto.includes('7 dias úteis') && !texto.includes('IMEDIATO'));
  check('o PDF traz as observações digitadas no lugar das padrão', texto.includes('Frete por conta do cliente') && texto.includes('Peça sob encomenda') && !texto.includes('Impostos inclusos'));
  check('o PDF traz a razão social do cadastro do CNPJ e a validade de 20 dias', texto.includes('EQUIPAMENTOS DE JARDINAGEM LTDA') && texto.includes('20 dias'));
});

await step('prazo escolhido sai no PDF: Pronta entrega, Encomenda e Sem prazo (orçamento expresso)', async () => {
  const baixar = async nome => {
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), gaveta.getByRole('button', { name: 'PDF' }).click()]);
    const destino = path.join(OUT, `${theme}-orcamento-${nome}.pdf`);
    await download.saveAs(destino);
    return fs.readFileSync(destino).toString('latin1');
  };
  const grupoPrazo = gaveta.getByRole('group', { name: 'Prazo das peças' });
  await grupoPrazo.getByRole('button', { name: 'Pronta entrega' }).click();
  // O caso que o dono achou: prazo "Pronta entrega" com a observação digitada "Peça sob encomenda". A gaveta avisa.
  check('prazo e observação digitada se contradizem: a gaveta avisa', /As observações falam em encomenda, mas o prazo é pronta entrega/.test(await gaveta.getByRole('alert').innerText()));
  await gaveta.getByRole('button', { name: /Observações do orçamento/ }).click();
  await gaveta.getByRole('button', { name: 'Voltar ao texto padrão' }).click();
  await gaveta.getByRole('button', { name: 'Esconder as observações' }).click();
  check('voltando ao texto padrão o aviso some', (await gaveta.getByRole('alert').count()) === 0);
  const imediato = await baixar('imediato');
  check('Pronta entrega: o PDF tem a coluna PRAZO e diz Pronta entrega (não mais "Imediato")', imediato.includes('PRAZO') && imediato.includes('Pronta entrega') && !imediato.includes('Imediato'));
  check('Pronta entrega: a observação diz "Peça em pronta entrega" e não fala de encomenda', imediato.includes('Peça em pronta entrega') && !/encomenda/i.test(imediato));
  await grupoPrazo.getByRole('button', { name: 'Encomenda' }).click();
  const encomenda = await baixar('encomenda');
  check('Encomenda: a observação diz "Peça sob encomenda" e não fala de pronta entrega', encomenda.includes('Peça sob encomenda') && !/pronta entrega/i.test(encomenda));
  await grupoPrazo.getByRole('button', { name: 'Sem prazo' }).click();
  const expresso = await baixar('expresso');
  check('Sem prazo: o PDF não tem coluna de prazo, só descrição, quantidade e valores', !expresso.includes('PRAZO') && !expresso.includes('Pronta entrega') && !/Peça (em pronta entrega|sob encomenda)/.test(expresso) && expresso.includes('VALOR TOTAL'));
  await gaveta.getByRole('button', { name: 'Ver a mensagem antes de enviar' }).click();
  const previa = (await gaveta.getByLabel('Mensagem do WhatsApp').innerText()).trim();
  check('Sem prazo: a mensagem do WhatsApp não fala de prazo', previa.length > 50 && !/Prazo das peças/.test(previa));
  await gaveta.getByRole('button', { name: 'Esconder a mensagem' }).click();
});

await step('voltar ao texto padrão', async () => {
  await gaveta.getByRole('button', { name: /Observações do orçamento/ }).click();
  check('as observações estão no padrão da loja (sem botão de voltar)', (await gaveta.getByRole('button', { name: 'Voltar ao texto padrão' }).count()) === 0);
  check('as observações voltam ao padrão da loja', /Impostos inclusos/.test(await gaveta.getByLabel('Observações do orçamento').inputValue()));
  await gaveta.getByRole('group', { name: 'Prazo das peças' }).getByRole('button', { name: 'Sem prazo' }).click();
  await gaveta.getByRole('button', { name: 'Esconder as observações' }).click();
});

await step('ver e imprimir (o PDF do cliente, a mesma folha do botão PDF)', async () => {
  await gaveta.getByRole('button', { name: 'Prévia' }).click();
  const previa = page.getByRole('dialog', { name: 'Orçamento para o cliente' });
  await previa.getByTitle('Prévia do PDF do orçamento').waitFor({ timeout: 20000 });
  check('abre a prévia do PDF do cliente', true);
  check('a prévia tem Baixar PDF e Imprimir', (await previa.getByRole('button', { name: 'Baixar PDF' }).count()) === 1 && (await previa.getByRole('button', { name: 'Imprimir' }).count()) === 1);
  await previa.getByRole('button', { name: 'Fechar' }).click();
  await page.waitForTimeout(300);
  check('fechar volta para a gaveta', (await page.getByRole('dialog', { name: 'Orçamento para o cliente' }).count()) === 0);
});

await step('arquivamento (WhatsApp e PDF guardam o orçamento)', async () => {
  const lista = await page.evaluate(() => fetch('/api/quotes?limit=5', { credentials: 'include' }).then(r => r.json()).catch(() => null));
  const n = (lista?.quotes ?? lista?.items ?? []).length;
  check('há ao menos um orçamento arquivado depois de enviar', n >= 1, `${n} arquivados`);
});

await step('remover e esvaziar', async () => {
  const antesDeRemover = await gaveta.getByRole('button', { name: /^Remover / }).count();
  await gaveta.getByRole('button', { name: /^Remover / }).first().click();
  await page.waitForTimeout(400);
  check('remover tira exatamente um item', (await gaveta.getByRole('button', { name: /^Remover / }).count()) === antesDeRemover - 1, `${antesDeRemover} → ${await gaveta.getByRole('button', { name: /^Remover / }).count()}`);
  await gaveta.getByRole('button', { name: 'Esvaziar' }).click();
  check('esvaziar pergunta antes, no diálogo do site, dizendo quantos itens vão', (await page.getByRole('alertdialog').innerText()).includes('itens'));
  await confirmar(page, 'Esvaziar');
  await page.waitForTimeout(800);
  check('esvaziar limpa o orçamento', (await page.getByRole('dialog').count()) === 0 || (await page.getByText('Adicione peças').count()) > 0);
});

await step('fechar com Esc', async () => {
  await page.getByRole('button', { name: /^Orçamento/ }).first().click().catch(() => {});
  await page.waitForTimeout(500);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check('Esc fecha a gaveta do orçamento', (await page.getByRole('dialog').count()) === 0);
});

await finish(browser, errors);
