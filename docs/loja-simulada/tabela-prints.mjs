// Prints da Tabela de preços e da gaveta de uma máquina (não é teste).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/tabela-prints.mjs [tema] [prefixo]
import { open, shot } from './_t.mjs';

const theme = process.argv[2] ?? 'light';
const pre = process.argv[3] ?? 'tab';
const { browser, page, errors } = await open({ theme });
await page.goto('http://127.0.0.1:5173/tabela-de-precos');
await page.waitForTimeout(2500);
await shot(page, `${pre}-${theme}-1-lista`);
await page.locator('tbody tr').nth(1).click();
await page.waitForTimeout(3500);
await shot(page, `${pre}-${theme}-2-gaveta`);
console.log('erros no console:', errors.slice(0, 5));
await browser.close();
