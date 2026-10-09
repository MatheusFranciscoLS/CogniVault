// TECLADO PRIMEIRO no Atendimento: setas, Enter, + e a barra. (O "Copiar códigos" saiu: o Clipp recebe 1 código por vez.)
// Uso (de dentro de frontend/): node ../docs/loja-simulada/teclado-completo.mjs [tema]
import { open, check, step, finish, shot, SEARCH } from './_t.mjs';

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

await step('Enter com a busca anterior ainda em "Buscando…" inicia a nova busca (o botão nunca fica desabilitado)', async () => {
  // Achado da auditoria de 2026-10-09: com o botão desabilitado durante a busca, o navegador ignorava o Enter e nada acontecia.
  // 506027201 não tem peça no catálogo: a busca fica em "Buscando…" enquanto o Portal responde a troca de código.
  await campo().fill('506027201');
  await campo().press('Enter');
  await page.getByRole('alert', { name: 'Código substituído' }).waitFor({ timeout: 30000 });
  const botao = page.getByRole('button', { name: /^(Buscar|Buscando…)$/ });
  check('o botão de busca não está desabilitado', await botao.isEnabled());
  await campo().fill('587106701');
  const nova = page.waitForRequest(req => req.url().includes('/api/search/stream') && req.url().includes('typed=587106701'), { timeout: 4000 }).then(() => true, () => false);
  await campo().press('Enter');
  check('o Enter dispara a nova busca na hora', await nova);
  await copiarBotoes().first().waitFor({ timeout: 30000 });
  check('e o resultado novo aparece', (await copiarBotoes().count()) > 0);
});

await finish(browser, errors);
