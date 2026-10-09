// PRÉVIA DO PDF DO ORÇAMENTO DE PEÇAS (pedido do dono, 2026-10-09: "quero os 3 orçamentos na mesma qualidade", o de máquina estava superior):
// "Prévia" mostra o PDF real que o cliente recebe, com data do orçamento, assunto (Ref.) e validade editáveis, e Imprimir imprime ESTE documento.
// Confere o conteúdo do arquivo (data, validade contada da data, assunto, cliente) e que nenhum código de peça vai ao cliente.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/orcamento-pdf-previa.mjs [tema]
import { open, check, step, finish, shot, SEARCH, clearQuote } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

const textoDoPdf = () => page.evaluate(async () => {
  const frame = document.querySelector('iframe[title="Prévia do PDF do orçamento"]');
  const url = frame?.getAttribute('src')?.split('#')[0];
  if (!url) return null;
  const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
  let bruto = '';
  for (const byte of bytes) bruto += String.fromCharCode(byte);
  return bruto;
});

try {
  await clearQuote(page);
  await page.reload();
  const busca = page.getByPlaceholder(SEARCH);
  await busca.fill('carburador 143RII');
  await busca.press('Enter');
  await page.getByRole('button', { name: /^\+ Orçamento/ }).first().waitFor({ timeout: 40000 });
  await page.getByRole('button', { name: /^\+ Orçamento/ }).first().click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Revisar orçamento' }).click();
  const gaveta = page.getByRole('dialog').first();
  await gaveta.waitFor();
  await gaveta.getByPlaceholder('Nome do cliente').fill('Fazenda Boa Vista');
  await page.waitForTimeout(400);

  await step('A prévia mostra o PDF de verdade, e o botão de imprimir da gaveta virou "Prévia"', async () => {
    check('não existe mais o botão "Imprimir" solto na gaveta', (await gaveta.getByRole('button', { name: 'Imprimir', exact: true }).count()) === 0);
    await gaveta.getByRole('button', { name: 'Prévia' }).click();
    const previa = page.getByRole('dialog', { name: 'Orçamento para o cliente' });
    await previa.getByTitle('Prévia do PDF do orçamento').waitFor({ timeout: 20000 });
    const pdf = await textoDoPdf();
    check('o conteúdo é um PDF', !!pdf && pdf.startsWith('%PDF'), String(pdf?.slice(0, 8)));
    check('leva o cliente do orçamento', !!pdf && pdf.includes('Fazenda Boa Vista'));
    check('leva o assunto padrão', !!pdf && pdf.includes('Estimativa de Pre'));
    check('NÃO leva código de peça (nem com máscara)', !!pdf && !/587106701|587 10 67-01/.test(pdf));
    await shot(page, `${theme}-1366-orcamento-pdf-previa`);
  });

  await step('Data, assunto e validade mudam o documento', async () => {
    const previa = page.getByRole('dialog', { name: 'Orçamento para o cliente' });
    await previa.getByLabel('Data do orçamento').fill('2026-12-05');
    await previa.getByLabel('Assunto (Ref.)').fill('Orçamento Peças Husqvarna 143RII');
    await previa.getByLabel('Validade (dias)').fill('10');
    await page.waitForTimeout(1500);
    const pdf = await textoDoPdf();
    check('a data do orçamento é a escolhida (5 de dezembro)', !!pdf && /05 de dezembro de 2026/.test(pdf));
    check('a validade conta da data escolhida: 10 dias → 15/12/2026', !!pdf && pdf.includes('10 dias') && pdf.includes('15/12/2026'));
    check('o assunto digitado vai no PDF', !!pdf && pdf.includes('Orçamento Peças Husqvarna 143RII'.normalize('NFC')));
  });

  await step('Entrada ruim não quebra: data vazia, validade zero ou enorme, assunto enorme', async () => {
    const previa = page.getByRole('dialog', { name: 'Orçamento para o cliente' });
    await previa.getByLabel('Validade (dias)').fill('0');
    await page.waitForTimeout(600);
    check('validade inválida marca o campo e não derruba a tela', (await previa.getByLabel('Validade (dias)').getAttribute('aria-invalid')) === 'true');
    await previa.getByLabel('Validade (dias)').fill('99999');
    await page.waitForTimeout(600);
    check('validade enorme também é recusada', (await previa.getByLabel('Validade (dias)').getAttribute('aria-invalid')) === 'true');
    await previa.getByLabel('Validade (dias)').fill('20');
    await previa.getByLabel('Data do orçamento').fill('');
    await page.waitForTimeout(600);
    check('data vazia marca o campo', (await previa.getByLabel('Data do orçamento').getAttribute('aria-invalid')) === 'true');
    await previa.getByLabel('Data do orçamento').fill('2026-10-15');
    await previa.getByLabel('Assunto (Ref.)').fill('A'.repeat(500));
    await page.waitForTimeout(1500);
    check('assunto é cortado em 120 caracteres', (await previa.getByLabel('Assunto (Ref.)').inputValue()).length === 120);
    check('o PDF continua aparecendo', (await textoDoPdf())?.startsWith('%PDF') === true);
  });

  await step('Baixar PDF baixa o mesmo documento e a gaveta continua com os itens', async () => {
    const previa = page.getByRole('dialog', { name: 'Orçamento para o cliente' });
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), previa.getByRole('button', { name: 'Baixar PDF' }).click()]);
    check('baixou um PDF com o nome do orçamento', /^Orcamento_Vardao_\d+\.pdf$/.test(download.suggestedFilename()), download.suggestedFilename());
    await previa.getByRole('button', { name: 'Fechar' }).click();
    await page.waitForTimeout(400);
    check('fechou e a gaveta segue com 1 item', (await page.getByRole('dialog').first().innerText()).includes('1 item'));
  });

  await step('Esc fecha a prévia e a gaveta continua', async () => {
    await gaveta.getByRole('button', { name: 'Prévia' }).click();
    await page.getByRole('dialog', { name: 'Orçamento para o cliente' }).waitFor();
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check('só a prévia fechou', (await page.getByRole('dialog', { name: 'Orçamento para o cliente' }).count()) === 0 && (await page.getByRole('dialog').count()) === 1);
  });
} finally {
  await clearQuote(page).catch(() => {});
}

await finish(browser, errors);
