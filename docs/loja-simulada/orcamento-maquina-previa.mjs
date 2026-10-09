// PRÉVIA do PDF no orçamento de MÁQUINA: o balcão vê o documento que o cliente recebe antes de baixar, e imprime ESTE documento.
// Vários modelos, ajuste em tempo real (digitação rápida), valor inválido e volta ao válido, foto ligada e desligada, imprimir, fechar no meio.
// Pré-requisito: lista de máquinas importada na loja simulada. Uso (de dentro de frontend/): node ../docs/loja-simulada/orcamento-maquina-previa.mjs [tema]
import { open, check, step, finish, shot, sqlSim } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const pdfText = async url => page.evaluate(async u => {
  const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
}, url);
const texto = bruto => bruto.replace(/\\([()])/g, '$1');
const imagens = bruto => (bruto.match(/\/Subtype \/Image/g) ?? []).length;

async function abrir(modelo) {
  const alvo = sqlSim(`SELECT pnc || '|' || model FROM "MachineListing" WHERE upper(regexp_replace(model, '[^A-Za-z0-9]', '', 'g')) = '${modelo.toUpperCase()}' ORDER BY pnc LIMIT 1`);
  if (!alvo) return null;
  const [pnc, nome] = alvo.split('|');
  for (let i = 0; i < 4 && await page.getByRole('dialog').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(300); }
  await page.getByLabel('Buscar máquina na tabela').fill(pnc);
  await page.locator('main tbody tr', { hasText: pnc }).locator('td').first().getByRole('button').click();
  const gaveta = page.getByRole('dialog');
  await gaveta.waitFor({ timeout: 8000 });
  await gaveta.getByRole('button', { name: 'Orçamento', exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: new RegExp(`Orçamento da ${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
  await dialogo.waitFor({ timeout: 5000 });
  return { dialogo, pnc, nome };
}
const frameUrl = async dialogo => dialogo.locator('iframe[title="Prévia do PDF do orçamento da máquina"]').getAttribute('src', { timeout: 15000 });

await page.getByRole('button', { name: 'Tabela de preços', exact: true }).click();
await page.locator('main tbody tr td').first().waitFor({ timeout: 15000 });

await step('A prévia mostra o PDF do cliente e acompanha o que se digita', async () => {
  const r = await abrir('281XP');
  if (!r) return check('281XP está na lista da simulação', false);
  const { dialogo } = r;
  check('sem prévia aberta, não há iframe', await dialogo.locator('iframe').count() === 0);
  await dialogo.getByLabel('Cliente (A/C)').fill('Fazenda Boa Vista');
  await dialogo.getByLabel(/Preço do orçamento/).fill('4.250,00');
  await dialogo.getByRole('button', { name: 'Prévia', exact: true }).click();
  const url1 = await frameUrl(dialogo);
  check('a prévia abre com o PDF (blob)', /^blob:/.test(url1 ?? ''), String(url1).slice(0, 60));
  const pdf1 = texto(await pdfText(url1.split('#')[0]));
  check('é um PDF de verdade', pdf1.startsWith('%PDF'));
  check('traz o cliente digitado', pdf1.includes('Fazenda Boa Vista'));
  check('traz o preço digitado, não o da lista', pdf1.includes('R$ 4.250,00') && !pdf1.includes('R$ 4.599,00'));
  check('traz a classe de uso marcada', pdf1.includes('Uso profissional em tempo integral'));
  check('traz a foto além do logo', imagens(pdf1) >= 2, `${imagens(pdf1)} imagens`);
  check('não traz o PNC', !pdf1.includes(r.pnc));
  check('o botão Imprimir aparece com a prévia', await dialogo.getByRole('button', { name: 'Imprimir' }).isVisible());
  await shot(page, `${theme}-1366-orcamento-maquina-previa`);

  // digitação rápida: vale o último valor, não um intermediário
  const preco = dialogo.getByLabel(/Preço do orçamento/);
  await preco.fill('');
  await preco.pressSequentially('5123,45', { delay: 25 });
  await page.waitForFunction(old => document.querySelector('iframe[title="Prévia do PDF do orçamento da máquina"]')?.getAttribute('src') !== old, url1, { timeout: 15000 });
  await page.waitForTimeout(900);
  const url2 = await frameUrl(dialogo);
  const pdf2 = texto(await pdfText(url2.split('#')[0]));
  check('a prévia acompanha o preço novo', pdf2.includes('R$ 5.123,45'), pdf2.match(/Preço: R\$ [\d.,]+/)?.[0]);
  check('e já não mostra o preço antigo', !pdf2.includes('R$ 4.250,00'));

  // foto desligada
  await dialogo.getByRole('checkbox', { name: 'Incluir a foto da máquina' }).uncheck();
  await page.waitForFunction(old => document.querySelector('iframe[title="Prévia do PDF do orçamento da máquina"]')?.getAttribute('src') !== old, url2, { timeout: 15000 });
  await page.waitForTimeout(600);
  const pdf3 = texto(await pdfText((await frameUrl(dialogo)).split('#')[0]));
  check('sem a foto, o PDF perde uma imagem', imagens(pdf3) < imagens(pdf2), `${imagens(pdf2)} -> ${imagens(pdf3)}`);
});

await step('Valor inválido avisa e volta ao normal quando se corrige', async () => {
  const dialogo = page.getByRole('dialog', { name: /Orçamento da 281XP/ });
  const preco = dialogo.getByLabel(/Preço do orçamento/);
  await preco.fill('abc');
  await page.waitForTimeout(1200);
  check('o campo de preço continua apontando o erro', (await preco.getAttribute('aria-invalid')) === 'true');
  check('o botão de baixar fica desabilitado', await dialogo.getByRole('button', { name: /Baixar orçamento em PDF/ }).isDisabled());
  await preco.fill('3.999,00');
  await page.waitForTimeout(1500);
  const pdf = texto(await pdfText((await frameUrl(dialogo)).split('#')[0]));
  check('corrigido, a prévia volta e traz o valor', pdf.includes('R$ 3.999,00'));
  check('não ficou mensagem de erro na tela', !(await dialogo.innerText()).includes('Não foi possível montar o PDF'));
});

await step('Imprimir manda ESTE documento para a impressão', async () => {
  const dialogo = page.getByRole('dialog', { name: /Orçamento da 281XP/ });
  await page.evaluate(() => {
    const frame = document.querySelector('iframe[title="Prévia do PDF do orçamento da máquina"]');
    window.__impressoes = 0;
    frame.contentWindow.print = () => { window.__impressoes++; };
  });
  await dialogo.getByRole('button', { name: 'Imprimir' }).click();
  check('chamou a impressão da prévia uma vez', await page.evaluate(() => window.__impressoes) === 1);
});

await step('Baixar entrega o mesmo conteúdo que a prévia mostrou', async () => {
  const dialogo = page.getByRole('dialog', { name: /Orçamento da 281XP/ });
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), dialogo.getByRole('button', { name: /Baixar orçamento em PDF/ }).click()]);
  const caminho = await download.path();
  const bruto = texto((await import('node:fs')).readFileSync(caminho).toString('latin1'));
  check('o arquivo baixado traz o que a prévia mostrava (cliente, preço, uso)', bruto.includes('Fazenda Boa Vista') && bruto.includes('R$ 3.999,00') && bruto.includes('Uso profissional em tempo integral'));
});

await step('Outros modelos: roçadeira, cortador e giro zero mostram a prévia sem erro', async () => {
  for (const modelo of ['143RST', 'LC151', 'Z460']) {
    const r = await abrir(modelo);
    if (!r) { console.log(`   (${modelo} não está na lista da simulação)`); continue; }
    await r.dialogo.getByRole('button', { name: 'Prévia', exact: true }).click();
    const url = await frameUrl(r.dialogo);
    const pdf = texto(await pdfText(url.split('#')[0]));
    check(`${modelo}: o PDF abre e fala do modelo`, pdf.startsWith('%PDF') && pdf.toLowerCase().includes(modelo.toLowerCase().replace(/\s/g, '')) || pdf.includes(r.nome), r.nome);
    check(`${modelo}: sem PNC`, !pdf.includes(r.pnc));
    check(`${modelo}: sem mensagem de erro`, !(await r.dialogo.innerText()).includes('Não foi possível montar o PDF'));
    await r.dialogo.getByRole('button', { name: 'Fechar prévia' }).click();
    check(`${modelo}: fechar a prévia tira o iframe`, await r.dialogo.locator('iframe').count() === 0);
  }
});

await step('Fechar o diálogo com a prévia montando não deixa erro', async () => {
  const r = await abrir('281XP');
  if (!r) return check('281XP está na lista da simulação', false);
  await r.dialogo.getByRole('button', { name: 'Prévia', exact: true }).click();
  await r.dialogo.getByLabel('Cliente (A/C)').pressSequentially('Fechou no meio', { delay: 10 });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(1500);
  check('o diálogo fechou', await page.getByRole('dialog', { name: /Orçamento da 281XP/ }).count() === 0);
});

await finish(browser, errors);
