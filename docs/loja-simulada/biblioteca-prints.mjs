// Prints da Biblioteca de catálogos (Gerenciar biblioteca) nos dois temas. Não é teste.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/biblioteca-prints.mjs [tema]
import { open, shot } from './_t.mjs';
const theme = process.argv[2] ?? 'light';
const { browser, page, errors } = await open({ theme });
await page.goto('http://127.0.0.1:5173/catalogos');
await page.getByRole('button', { name: 'Gerenciar biblioteca' }).click();
await page.waitForTimeout(2500);
await shot(page, `bib-${theme}-1`);
await page.screenshot({ path: process.env.LOCALAPPDATA + `/Temp/cvsim/shots/bib-${theme}-full.png`, fullPage: true });
console.log('erros no console:', errors.slice(0, 5));
await browser.close();
