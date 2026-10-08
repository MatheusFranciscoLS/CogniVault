// Prints da área de importação de PDFs e da visão em grade da Biblioteca (não é teste).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/biblioteca-importacao-prints.mjs [tema]
import { open, shot } from './_t.mjs';
const theme = process.argv[2] ?? 'dark';
const { browser, page, errors } = await open({ theme });
await page.goto('http://127.0.0.1:5173/catalogos');
await page.getByRole('button', { name: 'Gerenciar biblioteca' }).click();
await page.waitForTimeout(2500);
await page.getByRole('button', { name: 'Importar PDFs' }).click();
await page.waitForTimeout(1000);
await shot(page, `bimp-${theme}-1-importar`);
await page.getByRole('button', { name: 'Fechar importação' }).click();
await page.getByTitle('Visualização em Grade').click();
await page.waitForTimeout(800);
await shot(page, `bimp-${theme}-2-grade`);
console.log('erros no console:', errors.slice(0, 5));
await browser.close();
