// Prints da gaveta de orçamento do balcão em vários estados (não é teste).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/orcamento-prints.mjs [tema] [prefixo]
import { open, shot, SEARCH } from './_t.mjs';

const theme = process.argv[2] ?? 'light';
const pre = process.argv[3] ?? 'orc';
const { browser, page, errors } = await open({ theme });
const campo = page.getByPlaceholder(SEARCH);
await campo.fill('carburador 143RII');
await campo.press('Enter');
await page.waitForTimeout(3500);
const add = page.locator('[data-row-add]');
await add.nth(0).click(); await add.nth(1).click(); await add.nth(2).click();
await page.locator('header').getByRole('button', { name: /Orçamento 3/ }).click();
await page.waitForTimeout(1200);
await shot(page, `${pre}-${theme}-1-gaveta`);
console.log('erros no console:', errors.slice(0, 5));
await browser.close();
