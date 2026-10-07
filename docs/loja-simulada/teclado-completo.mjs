// TECLADO PRIMEIRO no Atendimento e "Copiar códigos" do orçamento (para colar no Clipp).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/teclado-completo.mjs [tema]
import { open, check, step, finish, shot, clearQuote, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });
const campo = () => page.getByPlaceholder(SEARCH);
const copiarBotoes = () => page.locator('[data-row-copy]');
const focado = () => page.evaluate(() => document.activeElement?.getAttribute('aria-label') ?? '');
const codigoDe = rotulo => rotulo.replace('Copiar código ', '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();

async function buscarVela() {
  await campo().fill('vela de ignição');
  await campo().press('Enter');
  await copiarBotoes().first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(1500);
}

await step('Copiar códigos do orçamento (para o Clipp)', async () => {
  await buscarVela();
  // Duas peças diferentes, uma delas duas vezes, e um óleo avulso (serviço, sem código de peça).
  const rotulos = await copiarBotoes().evaluateAll(l => l.slice(0, 2).map(e => e.getAttribute('aria-label')));
  const adicionar = n => page.locator('[data-row-add]').nth(n).click();
  await adicionar(0);
  await adicionar(0);
  await adicionar(1);
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: 'Revisar orçamento' }).click();
  const gaveta = page.getByRole('dialog').first();
  await gaveta.waitFor({ timeout: 8000 });
  await gaveta.getByRole('button', { name: 'Copiar códigos' }).click();
  await page.waitForTimeout(500);
  const texto = (await page.evaluate(() => navigator.clipboard.readText())).split('\r\n').join('\n');
  const linhas = texto.split('\n');
  check('uma linha por código diferente', linhas.length === 2, linhas.join(' | '));
  check('cada linha é "código", TAB e quantidade', linhas.every(l => /^[A-Z0-9]{6,}\t\d+$/.test(l)));
  check('a peça adicionada duas vezes sai com quantidade 2', linhas[0].endsWith('\t2') && linhas[1].endsWith('\t1'), linhas.join(' | '));
  check('os códigos são os das linhas buscadas, sem máscara', linhas[0].startsWith(codigoDe(rotulos[0])) && linhas[1].startsWith(codigoDe(rotulos[1])), `${rotulos.join(' | ')}`);
  await shot(page, `${theme}-1366-copiar-codigos`);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
});

await step('percorrer a lista com o teclado', async () => {
  await buscarVela();
  const total = await copiarBotoes().count();
  check('a busca traz várias linhas para percorrer', total >= 3, `${total}`);

  await campo().focus();
  await page.keyboard.press('ArrowDown');
  const primeiro = await focado();
  check('↓ no campo de busca vai para o código da primeira linha', /^Copiar código /.test(primeiro), primeiro);
  const posPrimeiro = await copiarBotoes().first().evaluate(e => e.getBoundingClientRect().top);

  await page.keyboard.press('ArrowDown');
  const segundo = await focado();
  check('↓ vai para a linha seguinte', /^Copiar código /.test(segundo) && segundo !== primeiro, segundo);

  await page.keyboard.press('ArrowUp');
  check('↑ volta para a linha anterior', (await focado()) === primeiro);
  await page.keyboard.press('ArrowUp');
  check('↑ na primeira linha volta para o campo de busca', await campo().evaluate(e => e === document.activeElement));
  check('a primeira linha é a de cima na tela', posPrimeiro <= (await copiarBotoes().nth(1).evaluate(e => e.getBoundingClientRect().top)));
  await shot(page, `${theme}-1366-teclado`);
});

await step('Enter copia o código; + põe no orçamento', async () => {
  await campo().focus();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const rotulo = await focado();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(400);
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  check('Enter na linha copia o código dela (sem máscara)', copiado === codigoDe(rotulo) && /^[A-Z0-9]{6,}$/.test(copiado), `${rotulo} → ${copiado}`);

  await page.keyboard.press('+');
  await page.waitForTimeout(1200);
  const linha = page.locator('article', { has: page.locator('[data-row-copy]:focus') });
  check('+ põe a linha focada no orçamento', (await linha.locator('[data-row-add]').innerText()).includes('No orçamento'));
  check('o foco continua na linha (dá para seguir com as setas)', /^Copiar código /.test(await focado()));
});

await step('atalho / foca a busca', async () => {
  await page.locator('main').click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
  await page.keyboard.press('/');
  check('"/" leva o foco ao campo de busca', await campo().evaluate(e => e === document.activeElement));
  await campo().fill('abc');
  await page.keyboard.press('/');
  check('"/" digitado dentro do campo continua sendo texto', (await campo().inputValue()) === 'abc/');
  await campo().fill('vela de ignição');
});

await finish(browser, errors);
