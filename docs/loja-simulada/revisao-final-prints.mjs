// Prints da passada final: trilho e gaveta do orçamento, lista e gaveta de máquina nova (não é teste).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/revisao-final-prints.mjs [tema]
import { open, shot, SEARCH } from './_t.mjs';

const theme = process.argv[2] ?? 'dark';
const { browser, page, errors } = await open({ theme });
await page.goto('http://127.0.0.1:5173/atendimento');
await page.getByPlaceholder(SEARCH).first().fill('587106701');
await page.keyboard.press('Enter');
await page.waitForTimeout(3000);
await page.getByRole('button', { name: /\+ Orçamento/ }).first().click();
await page.waitForTimeout(1200);
await shot(page, `rev-${theme}-1-atendimento`);
await page.getByRole('button', { name: /Revisar orçamento/i }).first().click().catch(() => {});
await page.waitForTimeout(1500);
await shot(page, `rev-${theme}-2-gaveta-orcamento`);
await page.keyboard.press('Escape');
await page.goto('http://127.0.0.1:5173/tabela-de-precos');
await page.waitForTimeout(2500);
await shot(page, `rev-${theme}-3-tabela`);
const nova = page.locator('tbody tr', { hasText: 'Nova' }).first();
if (await nova.count()) { await nova.click(); await page.waitForTimeout(3500); await shot(page, `rev-${theme}-4-maquina-nova`); }
else console.log('nenhuma máquina "Nova" na lista');
console.log('erros no console:', errors.slice(0, 5));
await browser.close();
