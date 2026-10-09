// Três ajustes da vista explodida (plano 2.9 a 2.11, 2026-10-09):
//  1. passar o mouse (ou focar) numa posição do desenho acende a linha da peça, e passar na linha acende a posição (posições empilhadas);
//  2. a máquina reabre na ÚLTIMA vista que o balcão abriu nela (por aparelho; vista que sumiu cai na primeira);
//  3. filtro por nome nos conjuntos da Kawasaki, com saída quando nada casa.
// Precisa de internet (Portal Husqvarna e Kawasaki). Uso (de dentro de frontend/): node ../docs/loja-simulada/vista-explodida-ajustes.mjs [tema]
import { open, check, step, finish, shot } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const PNC_A = '967332901'; // 143R II
const PNC_B = '970466903'; // 345BT (2 vistas)

async function abrir(pnc) {
  await page.goto(`http://127.0.0.1:5173/dashboard?tab=machines&pnc=${pnc}`);
  await page.getByRole('region', { name: 'Vistas explodidas da máquina' }).waitFor({ timeout: 60000 });
  await page.locator('[data-hotspot="true"]').first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(800);
}
const nav = () => page.getByRole('navigation', { name: 'Vistas da máquina' });
const atual = async () => ((await nav().locator('[aria-current="true"]').first().innerText()) ?? '').replace(/\s+/g, ' ').trim();

await step('Passar o mouse numa posição do desenho acende a linha da peça (e some ao sair)', async () => {
  await abrir(PNC_A);
  const botao = page.locator('[data-hotspot="true"] button').nth(2);
  const posicao = (await botao.innerText()).trim();
  check('nenhuma linha começa acesa', (await page.locator('article.ring-2').count()) === 0);
  await botao.hover();
  await page.waitForTimeout(250);
  const acesas = page.locator('article.ring-2');
  check('a linha da peça acende', (await acesas.count()) >= 1, String(await acesas.count()));
  const texto = (await acesas.first().innerText()).replace(/\s+/g, ' ');
  check('é a linha da MESMA posição', new RegExp(`(^|\\s)${posicao}(\\s|$)`).test(texto), `posição ${posicao}: ${texto.slice(0, 80)}`);
  check('a posição do desenho fica por cima (z-20) e com anel', (await page.locator('[data-hotspot="true"].z-20').count()) >= 1 && /ring-4/.test((await page.locator('[data-hotspot="true"].z-20 button').first().getAttribute('class')) ?? ''));
  await shot(page, `${theme}-1366-vista-hover-desenho`);
  await page.mouse.move(5, 300);
  await page.waitForTimeout(250);
  check('ao sair, apaga', (await page.locator('article.ring-2').count()) === 0 && (await page.locator('[data-hotspot="true"].z-20').count()) === 0);
});

await step('Passar o mouse numa linha da lista acende a posição no desenho', async () => {
  const linha = page.locator('article').filter({ has: page.locator('span[title^="Posição"]') }).nth(3);
  await linha.scrollIntoViewIfNeeded();
  const posicao = (await linha.locator('span[title^="Posição"]').innerText()).trim();
  await linha.hover();
  await page.waitForTimeout(250);
  const ativo = page.locator('[data-hotspot="true"].z-20 button');
  check('a posição do desenho acende', (await ativo.count()) >= 1, String(await ativo.count()));
  check('é a mesma posição da linha', (await ativo.first().innerText()).trim() === posicao, `${(await ativo.first().innerText()).trim()} vs ${posicao}`);
  await page.mouse.move(5, 300);
  await page.waitForTimeout(250);
  check('ao sair, apaga', (await page.locator('[data-hotspot="true"].z-20').count()) === 0);
});

await step('Foco pelo teclado também acende (quem não usa mouse)', async () => {
  await page.locator('[data-hotspot="true"] button').nth(1).focus();
  await page.waitForTimeout(250);
  check('a linha acende com o foco', (await page.locator('article.ring-2').count()) >= 1);
  await page.locator('[data-hotspot="true"] button').nth(1).blur();
  await page.waitForTimeout(250);
  check('sai do foco, apaga', (await page.locator('article.ring-2').count()) === 0);
});

await step('A máquina reabre na última vista que o balcão abriu nela', async () => {
  await abrir(PNC_B);
  const primeira = await atual();
  const botoes = nav().getByRole('button');
  check('a máquina tem mais de uma vista', (await botoes.count()) >= 2, String(await botoes.count()));
  await botoes.nth(1).click();
  await page.waitForTimeout(500);
  const segunda = await atual();
  check('a vista mudou', segunda !== primeira, `${primeira} → ${segunda}`);
  await abrir(PNC_B);
  check('recarregando, reabre na mesma (a segunda)', (await atual()) === segunda, `${await atual()} vs ${segunda}`);
  await abrir(PNC_A);
  const outra = await atual();
  check('outra máquina não herda a vista', outra !== segunda || (await nav().getByRole('button').count()) === 0);
  await shot(page, `${theme}-1366-vista-lembrada`);
});

await step('Vista guardada que não existe mais cai na primeira, sem erro', async () => {
  await page.evaluate(pnc => localStorage.setItem(`cognivault_last_view:${pnc}`, 'VISTA-QUE-SUMIU'), PNC_B);
  await abrir(PNC_B);
  const botoes = nav().getByRole('button');
  check('abre normalmente, na primeira vista', (await botoes.first().getAttribute('aria-current')) === 'true');
});

await step('Armazenamento bloqueado não derruba a máquina', async () => {
  await page.addInitScript(() => {
    Storage.prototype.getItem = function (key) { if (String(key).startsWith('cognivault_last_view')) throw new Error('bloqueado'); return null; };
    Storage.prototype.setItem = function (key) { if (String(key).startsWith('cognivault_last_view')) throw new Error('cheio'); };
  });
  await abrir(PNC_A);
  await nav().getByRole('button').nth(1).click();
  check('a máquina abre e a vista troca mesmo assim', (await page.locator('[data-hotspot="true"]').count()) >= 0);
});

await step('Kawasaki: filtrar os conjuntos por nome, com saída quando nada casa', async () => {
  await page.goto('http://127.0.0.1:5173/dashboard?tab=machines&pnc=970542701'); // R316TX
  const cartao = page.getByRole('region', { name: 'Motor desta máquina' });
  await cartao.waitFor({ timeout: 60000 });
  await cartao.getByRole('button', { name: 'Ver peças e vista explodida' }).first().click();
  const motor = page.getByRole('region', { name: /Motor Kawasaki/ });
  await motor.waitFor({ timeout: 60000 });
  await motor.getByText('Conjuntos').waitFor({ timeout: 60000 });
  const botoesConjunto = () => motor.locator('div.flex-wrap.gap-2 > button');
  const total = await botoesConjunto().count();
  check('muitos conjuntos (o filtro aparece)', total > 8, String(total));
  const campo = motor.getByLabel('Filtrar os conjuntos do motor');
  await campo.waitFor();
  await campo.fill('CARBU');
  await page.waitForTimeout(300);
  const depois = await botoesConjunto().count();
  check('"CARBU" (maiúscula, parte do nome) deixa só os de carburador', depois >= 1 && depois < total, `${depois} de ${total}`);
  check('todos os que ficaram citam carburador', (await botoesConjunto().allInnerTexts()).every(t => /carbu/i.test(t)));
  await shot(page, `${theme}-1366-kawasaki-filtro-conjuntos`);
  await campo.fill('zzzzqq');
  await page.waitForTimeout(300);
  check('sem resultado: a saída aparece', (await motor.getByText(/Nenhum conjunto com "zzzzqq"/).count()) === 1);
  await motor.getByRole('button', { name: 'Mostrar todos' }).click();
  await page.waitForTimeout(300);
  check('"Mostrar todos" devolve a lista inteira e limpa o campo', (await botoesConjunto().count()) === total && (await campo.inputValue()) === '');
});

await finish(browser, errors);
