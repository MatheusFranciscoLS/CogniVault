// Prints da Biblioteca de catálogos (Gerenciar biblioteca) nos dois temas, em grade e em tabela. Não é teste.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/biblioteca-prints.mjs [tema] [prefixo]
import { open, shot } from './_t.mjs';
const theme = process.argv[2] ?? 'light';
const pre = process.argv[3] ?? 'bib';
const { browser, page, errors } = await open({ theme });
await page.goto('http://127.0.0.1:5173/catalogos');
await page.getByRole('button', { name: 'Gerenciar biblioteca' }).click();
await page.waitForTimeout(2500);
await shot(page, `${pre}-${theme}-1-grade`);
await page.locator('main').getByRole('button', { name: 'Tabela', exact: true }).click().catch(() => {});
await page.waitForTimeout(800);
await shot(page, `${pre}-${theme}-2-tabela`);
await page.screenshot({ path: process.env.LOCALAPPDATA + `/Temp/cvsim/shots/${pre}-${theme}-full.png`, fullPage: true });
console.log('erros no console:', errors.slice(0, 5));
await browser.close();
