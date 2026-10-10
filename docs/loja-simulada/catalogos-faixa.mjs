// CATÁLOGOS no padrão de faixa (direção B do redesenho, 2026-10-10): a busca e o filtro de categoria moram na faixa (campos brancos nos dois temas) e a visão
// "Gerenciar biblioteca" (que não usa PageFrame) ganha o próprio contêiner, porque o main agora vai de borda a borda. As funções têm `catalogos-completo.mjs`,
// `catalogos-motores.mjs` e `biblioteca-completo.mjs`. 1366×768, dois temas.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/catalogos-faixa.mjs [tema]
import { open, check, step, finish, shot, BASE } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
const textoDaTela = async () => (await page.locator('main').innerText()).replace(/\s+/g, ' ');

await page.goto(BASE + '/catalogos');
const busca = page.getByLabel('Buscar catálogo por modelo, arquivo, PNC ou aplicação');
await busca.waitFor({ timeout: 30000 });
await page.waitForTimeout(1500);

await step('A faixa tem o título, a contagem, o botão de gerenciar e os filtros', async () => {
  check('há um único h1 "Catálogos"', (await page.getByRole('heading', { level: 1 }).allInnerTexts()).join('|') === 'Catálogos');
  check('a contagem aparece no cabeçalho ("N catálogo(s)")', /\d+ catálogos?/.test(await textoDaTela()));
  const y = (await busca.boundingBox()).y;
  check('a busca está dentro da faixa (antes de 190 px)', y < 190, String(y));
  const fundos = await page.evaluate(() => [document.querySelector('[aria-label^="Buscar catálogo"]'), document.querySelector('[aria-label="Filtrar por categoria"]')].map(el => getComputedStyle(el).backgroundColor));
  check('a busca e a categoria têm fundo branco', fundos.every(cor => cor === 'rgb(255, 255, 255)'), fundos.join(' | '));
  check('o botão "Gerenciar biblioteca" está no cabeçalho (administrador)', await page.getByRole('button', { name: 'Gerenciar biblioteca' }).isVisible());
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('sem rolagem horizontal em 1366', largura.doc <= largura.win, JSON.stringify(largura));
  check('a tabela começa antes de 340 px', (await page.getByRole('table').boundingBox()).y < 340, String((await page.getByRole('table').boundingBox()).y));
  await shot(page, `${theme}-1366-catalogos-faixa`);
});

await step('Filtrar: a contagem acompanha e sem resultado há saída', async () => {
  const antes = (await textoDaTela()).match(/(\d+) catálogos?/)?.[1];
  await busca.fill('zzz-nenhum-9999');
  await page.waitForTimeout(500);
  check('sem resultado: "Nenhum catálogo encontrado" e contagem 0', (await textoDaTela()).includes('Nenhum catálogo encontrado') && /0 catálogos/.test(await textoDaTela()));
  await busca.fill('');
  await page.waitForTimeout(400);
  check('apagar o texto traz a lista de volta com a mesma contagem', (await textoDaTela()).match(/(\d+) catálogos?/)?.[1] === antes, `${antes}`);
});

await step('Gerenciar biblioteca: abre com margem própria e volta', async () => {
  await page.getByRole('button', { name: 'Gerenciar biblioteca' }).click();
  await page.getByRole('button', { name: /Voltar para catálogos/ }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const voltar = await page.getByRole('button', { name: /Voltar para catálogos/ }).boundingBox();
  check('o botão "Voltar" tem margem à esquerda (não cola na borda da janela)', voltar.x >= 16, String(voltar.x));
  const largura = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, win: window.innerWidth }));
  check('a biblioteca não tem rolagem horizontal', largura.doc <= largura.win, JSON.stringify(largura));
  await shot(page, `${theme}-1366-catalogos-faixa-biblioteca`);
  await page.getByRole('button', { name: /Voltar para catálogos/ }).click();
  await busca.waitFor({ timeout: 15000 });
  check('"Voltar" traz a lista de catálogos de volta', await busca.isVisible());
});

await finish(browser, errors);
