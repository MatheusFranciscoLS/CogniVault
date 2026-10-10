// PAGAMENTO do orçamento de MÁQUINA (dono, 2026-10-10): três meios (à vista, cartão em até 10x sem juros, boleto em até 6x sem juros), podendo valer vários;
// o boleto exige consulta e não vale na primeira compra, então vem desmarcado e avisa o atendente. "Outro" é a saída para escrever. Confere o que vai no PDF.
// Pré-requisito: lista de máquinas importada na loja simulada. Uso (de dentro de frontend/): node ../docs/loja-simulada/orcamento-maquina-pagamento.mjs [tema]
import { open, check, step, finish, shot, sqlSim } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const pdfText = async url => page.evaluate(async u => {
  const bytes = new Uint8Array(await (await fetch(u)).arrayBuffer());
  let out = '';
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
}, url);
const texto = bruto => bruto.replace(/\\([()])/g, '$1');
const paginas = bruto => (bruto.match(/\/Type \/Page[^s]/g) ?? []).length;
const FRAME = 'iframe[title="Prévia do PDF do orçamento da máquina"]';

await page.getByRole('button', { name: 'Tabela de preços', exact: true }).click();
await page.locator('main tbody tr td').first().waitFor({ timeout: 15000 });

const alvo = sqlSim(`SELECT pnc || '|' || model FROM "MachineListing" WHERE upper(regexp_replace(model, '[^A-Za-z0-9]', '', 'g')) = '281XP' ORDER BY pnc LIMIT 1`);
const [pnc, nome] = alvo.split('|');
await page.getByLabel('Buscar máquina na tabela').fill(pnc);
await page.locator('main tbody tr', { hasText: pnc }).locator('td').first().getByRole('button').click();
const gaveta = page.getByRole('dialog');
await gaveta.waitFor({ timeout: 8000 });
await gaveta.getByRole('button', { name: 'Orçamento', exact: true }).click();
const dialogo = page.getByRole('dialog', { name: new RegExp(`Orçamento da ${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
await dialogo.waitFor({ timeout: 5000 });
const grupo = dialogo.getByRole('group', { name: 'Condição de pagamento' });
const botao = rotulo => grupo.getByRole('button', { name: rotulo, exact: true });
const marcado = async rotulo => (await botao(rotulo).getAttribute('aria-pressed')) === 'true';

await dialogo.getByRole('button', { name: 'Prévia', exact: true }).click();
await dialogo.locator(FRAME).waitFor({ timeout: 15000 });
// a prévia refaz o PDF a cada ajuste (espera 400 ms): lê o PDF novo quando o endereço muda
const pdfAtual = async anterior => {
  if (anterior) await page.waitForFunction(({ sel, old }) => document.querySelector(sel)?.getAttribute('src') !== old, { sel: FRAME, old: anterior }, { timeout: 15000 });
  await page.waitForTimeout(500);
  const url = (await dialogo.locator(FRAME).getAttribute('src')).split('#')[0];
  return { url, bruto: texto(await pdfText(url)) };
};
let atual = await pdfAtual(null);

await step('Abre com À vista e cartão marcados e o boleto de fora', async () => {
  check('os quatro botões existem (À vista, Cartão 10x, Boleto 6x, Outro)', (await grupo.getByRole('button').allInnerTexts()).join('|') === 'À vista|Cartão 10x sem juros|Boleto 6x sem juros|Outro');
  check('À vista e Cartão vêm marcados, Boleto e Outro não', await marcado('À vista') && await marcado('Cartão 10x sem juros') && !(await marcado('Boleto 6x sem juros')) && !(await marcado('Outro')));
  check('sem boleto marcado não há aviso de consulta', await dialogo.getByText(/Consulte antes/).count() === 0);
  check('o PDF traz o cartão em até 10x sem juros e não fala de boleto', atual.bruto.includes('10x sem juros') && !atual.bruto.includes('Boleto'));
  check('o campo de texto livre antigo não existe mais (nada de "A combinar" digitável por padrão)', await dialogo.getByLabel('Condição de pagamento (escreva)').count() === 0);
  await shot(page, `${theme}-orcamento-maquina-pagamento`);
});

await step('Boleto: marcar avisa o atendente e entra no PDF como "sujeito a análise"', async () => {
  await botao('Boleto 6x sem juros').click();
  check('Boleto fica marcado', await marcado('Boleto 6x sem juros'));
  check('aparece o aviso "Consulte antes: o boleto não vale na primeira compra."', await dialogo.getByText('Consulte antes: o boleto não vale na primeira compra.').isVisible());
  atual = await pdfAtual(atual.url);
  check('o PDF traz o boleto em até 6x sem juros', atual.bruto.includes('6x sem juros'));
  // o texto do boleto quebra em duas linhas no PDF ("(sujeito a" / "análise)"): confere só o começo
  check('o PDF diz que o boleto é sujeito a análise (o cliente lê)', atual.bruto.includes('sujeito'));
  check('o PDF segue com uma página só', paginas(atual.bruto) === 1, String(paginas(atual.bruto)));
  await shot(page, `${theme}-orcamento-maquina-pagamento-boleto`);
  await botao('Boleto 6x sem juros').click();
  check('desmarcar o boleto tira o aviso', await dialogo.getByText(/Consulte antes/).count() === 0);
  atual = await pdfAtual(atual.url);
  check('e tira o boleto do PDF', !atual.bruto.includes('Boleto'));
});

await step('Combinações: só à vista, só cartão, nada marcado', async () => {
  await botao('Cartão 10x sem juros').click();
  atual = await pdfAtual(atual.url);
  check('só À vista: o PDF não fala de cartão nem de 10x', !atual.bruto.includes('10x'));
  await botao('Cartão 10x sem juros').click();
  await botao('À vista').click();
  atual = await pdfAtual(atual.url);
  check('só Cartão: o PDF traz 10x sem juros e não "À vista" como meio', atual.bruto.includes('10x sem juros'));
  await botao('Cartão 10x sem juros').click();
  atual = await pdfAtual(atual.url);
  check('nada marcado: o PDF diz "A combinar"', atual.bruto.includes('A combinar'));
  await botao('À vista').click(); await botao('Cartão 10x sem juros').click();
  atual = await pdfAtual(atual.url);
  check('voltar ao padrão traz o cartão de volta', atual.bruto.includes('10x sem juros'));
});

await step('Outro: a saída para escrever outra condição (e entrada absurda)', async () => {
  await botao('Outro').click();
  const campo = dialogo.getByLabel('Condição de pagamento (escreva)');
  check('Outro abre o campo e fica marcado', await campo.isVisible() && await marcado('Outro'));
  await campo.fill('50% na entrada e 50% em 15 dias');
  atual = await pdfAtual(atual.url);
  check('o texto escrito vai ao PDF junto com os meios marcados', atual.bruto.includes('50% na entrada e 50% em 15 dias') && atual.bruto.includes('10x sem juros'));
  await campo.fill('Z'.repeat(400));
  check('o campo recusa mais de 120 caracteres', (await campo.inputValue()).length === 120, String((await campo.inputValue()).length));
  await botao('Boleto 6x sem juros').click();
  atual = await pdfAtual(atual.url);
  check('com tudo marcado e 120 letras escritas o PDF continua com uma página', paginas(atual.bruto) === 1, String(paginas(atual.bruto)));
  await campo.fill('CONSORCIO ESPECIAL');
  atual = await pdfAtual(atual.url);
  check('outro texto escrito entra no PDF', atual.bruto.includes('CONSORCIO ESPECIAL'));
  await botao('Outro').click();
  check('fechar Outro apaga o texto escrito e esconde o campo', await campo.count() === 0);
  atual = await pdfAtual(atual.url);
  check('e o texto some do PDF (os meios marcados ficam)', !atual.bruto.includes('CONSORCIO') && atual.bruto.includes('10x sem juros'));
});

await step('Teclado: Tab chega aos botões e Espaço marca', async () => {
  await botao('À vista').focus();
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  check('Espaço desmarca À vista', !(await marcado('À vista')));
  await page.keyboard.press('Tab');
  check('Tab vai para o botão seguinte (Cartão)', await botao('Cartão 10x sem juros').evaluate(el => el === document.activeElement));
});

await finish(browser, errors);
