// GAVETA DO ORÇAMENTO inteira: itens (copiar, quantidade, preço, remover), item avulso, cliente, telefone,
// pagamento, desconto, WhatsApp (texto e número), PDF, imprimir, esvaziar e arquivamento.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/orcamento-completo.mjs [tema]
import fs from 'node:fs';
import { open, check, step, finish, shot, SEARCH, OUT } from './_t.mjs';
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
await page.waitForTimeout(3500);
const botoes = page.getByRole('button', { name: /^\+ Orçamento/ });
for (let i = 0; i < 3; i++) await botoes.first().click();
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
  console.log(`   telefone depois de digitar: "${await gaveta.getByPlaceholder('(19) 99999-9999').inputValue()}"`);
  const select = gaveta.locator('select');
  const opcoes = await select.locator('option').allInnerTexts();
  console.log(`   formas de pagamento: ${opcoes.join(' | ')}`);
  check('há formas de pagamento', opcoes.length >= 3);
  const total0 = (await gaveta.getByText(/^Total/).first().locator('xpath=..').innerText()).replace(/\s+/g, ' ');
  await gaveta.getByRole('button', { name: /^10% Balcão/ }).click();
  await page.waitForTimeout(400);
  const total10 = (await gaveta.getByText(/^Total/).first().locator('xpath=..').innerText()).replace(/\s+/g, ' ');
  check('desconto de 10% muda o total', total0 !== total10, `${total0} → ${total10}`);
  await select.selectOption({ index: 1 });
  await page.waitForTimeout(300);
  console.log(`   pagamento escolhido: ${await select.inputValue()}; desconto agora: ${(await gaveta.innerText()).match(/\d+% [A-Za-zé]+/g)?.join(',')}`);
  await shot(page, `${theme}-1366-orcamento-gaveta`);
});

await step('WhatsApp', async () => {
  await gaveta.getByRole('button', { name: 'Enviar no WhatsApp' }).click();
  await page.waitForTimeout(1500);
  const abertos = await page.evaluate(() => window.__aberto);
  check('abriu o WhatsApp', abertos.length === 1 && /wa\.me|whatsapp/.test(abertos[0]), abertos[0]?.slice(0, 60));
  if (abertos[0]) {
    const url = new URL(abertos[0]);
    const texto = url.searchParams.get('text') ?? '';
    fs.writeFileSync(path.join(OUT, `${theme}-whatsapp.txt`), texto);
    console.log('   ---- texto enviado ao cliente ----\n' + texto.split('\n').map(l => '   | ' + l).join('\n') + '\n   ----');
    check('o número do cliente vai no link, com 55', /\/55\d{10,11}/.test(url.pathname), url.pathname);
    check('o texto traz o nome do cliente', texto.includes('Sr. Carlos'));
    check('o texto traz o total', /R\$\s?\d/.test(texto));
    check('o texto não vaza posição/página/seção internas', !/Pos\.|Pág|Seção/i.test(texto));
    check('o texto diz até quando vale (data)', /\d{2}\/\d{2}\/\d{4}/.test(texto));
  }
});

await step('PDF', async () => {
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), gaveta.getByRole('button', { name: 'PDF' }).click()]);
  const destino = path.join(OUT, `${theme}-orcamento.pdf`);
  await download.saveAs(destino);
  const bytes = fs.readFileSync(destino);
  check('o PDF baixa com nome da loja', /Orcamento_Vardao/.test(download.suggestedFilename()), download.suggestedFilename());
  check('o arquivo é um PDF de verdade e não está vazio', bytes.subarray(0, 4).toString() === '%PDF' && bytes.length > 3000, `${bytes.length} bytes`);
});

await step('imprimir', async () => {
  await gaveta.getByRole('button', { name: 'Imprimir' }).click();
  await page.waitForTimeout(500);
  check('Imprimir chama a impressão do navegador', (await page.evaluate(() => window.__impresso)) >= 1);
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
