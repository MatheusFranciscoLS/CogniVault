// Print do painel da máquina 345BT (sem Portal, com o site público). Não é teste.
import { open, shot, SEARCH } from './_t.mjs';
const { browser, page, errors } = await open({ theme: 'light' });
const campo = page.getByPlaceholder(SEARCH);
await campo.fill('345bt');
await campo.press('Enter');
await page.getByRole('button', { name: /^345BT/ }).first().click();
await page.waitForTimeout(8000);
await shot(page, 'fonte-publica-345bt');
console.log('erros:', errors.slice(0, 3));
await browser.close();
