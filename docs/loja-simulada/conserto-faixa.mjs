// CONSERTO no padrão de faixa (direção B do redesenho, 2026-10-10): Nº da OS, Cliente e WhatsApp moram DENTRO da faixa (campos brancos nos dois temas), o editor e
// a pasta ficam embaixo, e em 1366×768 o total e os botões de enviar NUNCA ficam abaixo da dobra. As funções (linhas, prazo, pagamento, PDF, WhatsApp, pasta)
// têm o roteiro `conserto.mjs`. Dois temas.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/conserto-faixa.mjs [tema]
import { open, check, step, finish, shot, confirmar, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const textoDaTela = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

await page.goto(BASE + '/conserto');
const os = page.getByLabel('Nº da OS', { exact: true });
await os.waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);
const editor = page.getByRole('region', { name: 'Orçamento de conserto' });

// Sempre parte de uma cesta de conserto vazia (rodada anterior pode ter deixado linhas no rascunho do servidor).
const limpar = async () => {
  if (await editor.getByRole('button', { name: /^Remover / }).count() === 0 && (await os.inputValue()) === '') return;
  await editor.getByRole('button', { name: 'Novo orçamento' }).click();
  await confirmar(page, 'Começar novo');
  await page.waitForTimeout(600);
};
await limpar();

await step('Os campos do cliente moram na faixa e são brancos', async () => {
  check('há um único h1 "Conserto"', (await page.getByRole('heading', { level: 1 }).allInnerTexts()).join('|') === 'Conserto');
  const cliente = page.getByLabel('Cliente', { exact: true });
  const whats = page.getByLabel('WhatsApp', { exact: true });
  const ys = [(await os.boundingBox()).y, (await cliente.boundingBox()).y, (await whats.boundingBox()).y];
  check('Nº da OS, Cliente e WhatsApp estão dentro da faixa (antes de 190 px) e na mesma linha', ys.every(y => y < 190) && Math.max(...ys) - Math.min(...ys) < 4, ys.join(' / '));
  check('os três NÃO estão dentro do editor (o editor começa nas linhas)', await editor.getByLabel('Nº da OS', { exact: true }).count() === 0 && await editor.getByLabel('Cliente', { exact: true }).count() === 0);
  const fundos = await page.evaluate(() => ['repair-os', 'repair-customer', 'repair-phone'].map(id => getComputedStyle(document.getElementById(id)).backgroundColor));
  check('os três campos têm fundo branco', fundos.every(cor => cor === 'rgb(255, 255, 255)'), fundos.join(' | '));
  check('o campo começa em branco (o sistema não numera a OS)', (await os.inputValue()) === '');
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('sem rolagem horizontal em 1366', largura.doc <= largura.win, JSON.stringify(largura));
  await shot(page, `${theme}-1366-conserto-faixa`);
});

await step('Ordem do Tab: OS, cliente, WhatsApp e depois as linhas', async () => {
  await os.focus();
  const ordem = [];
  for (let i = 0; i < 4; i += 1) {
    ordem.push(await page.evaluate(() => document.activeElement?.id || document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName));
    await page.keyboard.press('Tab');
  }
  check('Tab percorre OS -> cliente -> WhatsApp', ordem.slice(0, 3).join(' > ') === 'repair-os > repair-customer > repair-phone', ordem.join(' > '));
  check('o quarto Tab sai dos campos do cliente (vai para o editor)', !['repair-os', 'repair-customer', 'repair-phone'].includes(ordem[3]), String(ordem[3]));
});

await step('Em 1366×768 o total e o envio nunca ficam abaixo da dobra', async () => {
  const caixa = await editor.boundingBox();
  check('o editor termina dentro da janela (≤ 768 px)', caixa.y + caixa.height <= 768, `${caixa.y} + ${caixa.height} = ${caixa.y + caixa.height}`);
  for (const nome of [/^Enviar no WhatsApp/, /^PDF/, /^Prévia/]) {
    const botao = editor.getByRole('button', { name: nome });
    const b = await botao.boundingBox();
    check(`o botão ${nome} está inteiro na janela`, b.y >= 0 && b.y + b.height <= 768, `${b.y} + ${b.height}`);
  }
  const alturaPagina = await page.evaluate(() => ({ doc: document.documentElement.scrollHeight, win: window.innerHeight }));
  check('a página quase não rola (≤ 24 px a mais que a janela)', alturaPagina.doc - alturaPagina.win <= 24, JSON.stringify(alturaPagina));
});

await step('Com muitas linhas só a lista rola; o total continua à vista', async () => {
  const nome = editor.getByLabel('Descrição do serviço ou item');
  const valor = editor.getByLabel('Valor unitário (R$)');
  for (let i = 1; i <= 14; i += 1) {
    await nome.fill(`Linha de teste ${i}`);
    await valor.fill('10');
    await editor.getByRole('button', { name: 'Adicionar' }).click();
  }
  await page.waitForTimeout(500);
  const caixa = await editor.boundingBox();
  check('com 14 linhas o editor continua dentro da janela', caixa.y + caixa.height <= 768, `${caixa.y + caixa.height}`);
  check('o botão de enviar continua inteiro na janela', (await editor.getByRole('button', { name: /^Enviar no WhatsApp/ }).boundingBox()).y + 40 <= 768);
  check('o total (R$ 140,00) está visível', (await textoDaTela()).includes('140,00'));
  await shot(page, `${theme}-1366-conserto-faixa-cheio`);
  await limpar();
});

await finish(browser, errors);
