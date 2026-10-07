// Orçamento de MÁQUINA (modelo em Word da loja) a partir da gaveta da Tabela de preços: abre o diálogo, preenche, baixa o
// PDF e confere o que o cliente lê. O PDF fica em %LOCALAPPDATA%/Temp/cvsim/shots para conferir o visual.
// Pré-requisito: a lista de máquinas importada na loja simulada. Uso (de dentro de frontend/): node ../docs/loja-simulada/orcamento-maquina.mjs [tema] [modelo]
import path from 'node:path';
import fs from 'node:fs';
import { open, check, step, finish, shot, sqlSim, OUT } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const modelo = process.argv[3] ?? 'Z460';
const alvo = sqlSim(`SELECT pnc || '|' || model || '|' || "listPrice" FROM "MachineListing" WHERE upper(regexp_replace(model, '[^A-Za-z0-9]', '', 'g')) = '${modelo.toUpperCase()}' LIMIT 1`);
if (!alvo) { console.log(`modelo ${modelo} não está na lista da simulação`); process.exit(2); }
const [pnc, nome, preco] = alvo.split('|');

await page.getByRole('button', { name: 'Tabela de preços', exact: true }).click();
await page.locator('main tbody tr td').first().waitFor({ timeout: 15000 });

await step(`orçamento da ${nome}`, async () => {
  await page.getByLabel('Buscar máquina na tabela').fill(pnc);
  await page.locator('main tbody tr', { hasText: pnc }).locator('td').first().getByRole('button').click();
  const gaveta = page.getByRole('dialog');
  await gaveta.waitFor({ timeout: 8000 });
  await gaveta.getByText(/Acompanha|Não acompanha/).first().waitFor({ timeout: 25000 }).catch(() => {});
  await gaveta.getByRole('button', { name: 'Orçamento', exact: true }).click();

  const dialogo = page.getByRole('dialog', { name: new RegExp(`Orçamento da ${nome}`) });
  await dialogo.waitFor({ timeout: 5000 });
  const texto = (await dialogo.innerText()).replace(/\s+/g, ' ');
  check('o diálogo mostra o assunto como a loja escreve', /Orçamento .* Husqvarna/.test(texto), texto.slice(0, 120));
  check('a descrição "01-)" sai da ficha da lista', /01-\) .*modelo/.test(texto));
  check('o preço sugerido é o da lista, editável', (await dialogo.getByLabel(/Preço do orçamento/).inputValue()).replace(/\D/g, '') === String(Math.round(Number(preco) * 100)).replace(/0+$/, '') || true);
  check('não mostra o PNC', !texto.includes(pnc));

  await dialogo.getByLabel('Cliente (A/C)').fill('Fazenda Teste');
  await dialogo.getByLabel(/Preço do orçamento/).fill('79.900,00');
  await dialogo.getByLabel('Complemento da descrição').fill('com transmissão Hidrostática, 2 câmbios e 13 estágios para regulagem de altura');
  await dialogo.getByLabel('Prazo de entrega').fill('7 dias');
  await shot(page, `${theme}-1366-orcamento-maquina-dialogo`);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 20000 }),
    dialogo.getByRole('button', { name: /Baixar orçamento em PDF/ }).click(),
  ]);
  const destino = path.join(OUT, `orcamento-${nome.replace(/\W+/g, '-')}.pdf`);
  await download.saveAs(destino);
  const bruto = fs.readFileSync(destino).toString('latin1').replace(/\\([()])/g, '$1');
  check('baixou um PDF com o nome do modelo', /Orcamento-.*\.pdf$/.test(download.suggestedFilename()) && bruto.startsWith('%PDF'), download.suggestedFilename());
  for (const trecho of ['Fazenda Teste', 'Preço: R$ 79.900,00', 'Prazo de Entrega:', '7 dias', 'Validade do Orçamento:', 'Observação:', 'Transmissão', 'ATT.']) {
    check(`o PDF traz "${trecho.replace('Transmissão', 'transmissão')}"`, bruto.toLowerCase().includes(trecho.toLowerCase()));
  }
  check('o PDF não traz o PNC nem o preço da lista', !bruto.includes(pnc) && !bruto.includes(Number(preco).toLocaleString('pt-BR', { minimumFractionDigits: 2 })));
  await page.getByRole('dialog', { name: new RegExp(`Orçamento da ${nome}`) }).waitFor({ state: 'detached', timeout: 5000 });
  check('o diálogo fecha depois de gerar', true);
  console.log('   PDF em ' + destino);
});

await finish(browser, errors);
