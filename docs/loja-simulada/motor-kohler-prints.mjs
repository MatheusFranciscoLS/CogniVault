// Print da vista explodida do motor Kohler com as posições (não é teste).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/motor-kohler-prints.mjs [tema]
import { open, shot, SEARCH } from './_t.mjs';
const theme = process.argv[2] ?? 'light';
const { browser, page, errors } = await open({ theme });
await page.getByPlaceholder(SEARCH).fill('SV540-3212');
await page.getByRole('button', { name: 'Buscar' }).click();
const painel = page.getByRole('region', { name: /Motor Kohler SV540-3212/ });
await painel.getByRole('button', { name: 'CrankShaft' }).click();
await painel.locator('article').first().waitFor({ timeout: 40000 });
const img = painel.locator('img').first();
await img.scrollIntoViewIfNeeded();
await page.waitForTimeout(2500);
console.log('imagem:', await img.evaluate(el => ({ ok: el.complete && el.naturalWidth > 0, w: el.clientWidth, h: el.clientHeight })));
await shot(page, `kohler-${theme}-vista`);
await painel.locator('article').first().scrollIntoViewIfNeeded();
await shot(page, `kohler-${theme}-pecas`);
console.log('erros no console:', errors.slice(0, 3));
await browser.close();
