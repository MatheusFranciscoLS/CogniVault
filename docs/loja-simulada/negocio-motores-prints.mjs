// Print do cartão "Peças de motor consultadas sem preço" no Negócio (não é teste).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/negocio-motores-prints.mjs [tema]
import { open, shot } from './_t.mjs';
const theme = process.argv[2] ?? 'light';
const { browser, page, errors } = await open({ theme });
await page.goto('http://127.0.0.1:5173/administracao/negocio');
const cartao = page.getByRole('heading', { name: 'Peças de motor consultadas sem preço' });
await cartao.waitFor({ timeout: 20000 });
await cartao.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
console.log('linhas:', await page.locator('table').last().locator('tbody tr').count());
await shot(page, `negocio-motores-${theme}`);
console.log('erros no console:', errors.slice(0, 3));
await browser.close();
