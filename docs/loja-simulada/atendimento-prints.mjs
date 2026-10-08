// Prints do Atendimento em vários estados, para analisar o visual (não é teste).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/atendimento-prints.mjs [tema] [prefixo]
import { open, shot, SEARCH } from './_t.mjs';

const theme = process.argv[2] ?? 'light';
const pre = process.argv[3] ?? 'atd';
const { browser, page, errors } = await open({ theme });

await page.waitForTimeout(800);
await shot(page, `${pre}-${theme}-1-vazio`);

const campo = page.getByPlaceholder(SEARCH);
await campo.fill('carburador 143RII');
await campo.press('Enter');
await page.waitForTimeout(3500);
await shot(page, `${pre}-${theme}-2-busca-peca`);

await campo.fill('587106701');
await campo.press('Enter');
await page.waitForTimeout(3500);
await shot(page, `${pre}-${theme}-3-codigo`);

await campo.fill('143RII');
await campo.press('Enter');
await page.waitForTimeout(4000);
await shot(page, `${pre}-${theme}-4-maquina`);

const linha = page.locator('main button, main [role="row"]').filter({ hasText: /143R/ }).first();
if (await linha.count()) { await linha.click().catch(() => {}); await page.waitForTimeout(2500); await shot(page, `${pre}-${theme}-5-clique`); }

await page.keyboard.press('Escape'); await page.waitForTimeout(500);
// orçamento com itens e a gaveta de uma peça
await campo.fill('carburador 143RII');
await campo.press('Enter');
await page.waitForTimeout(3500);
const add = page.locator('[data-row-add]');
await add.nth(0).click(); await add.nth(2).click();
await page.waitForTimeout(600);
await shot(page, `${pre}-${theme}-6-com-itens`);
await page.locator('[data-part-result]').first().click().catch(() => {});
await page.waitForTimeout(2500);
await shot(page, `${pre}-${theme}-7-gaveta-peca`);

console.log('erros no console:', errors.slice(0, 5));
await browser.close();
