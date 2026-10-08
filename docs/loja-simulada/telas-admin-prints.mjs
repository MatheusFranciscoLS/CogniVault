// Prints de Orçamentos, Usuários e Visão geral (não é teste).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/telas-admin-prints.mjs [tema]
import { open, shot } from './_t.mjs';
const theme = process.argv[2] ?? 'light';
const { browser, page, errors } = await open({ theme });
for (const [nome, url] of [['orcamentos', '/orcamentos'], ['usuarios', '/administracao/usuarios'], ['visao-geral', '/administracao/visao-geral']]) {
  await page.goto('http://127.0.0.1:5173' + url);
  await page.waitForTimeout(3000);
  await shot(page, `adm-${theme}-${nome}`);
}
console.log('erros no console:', errors.slice(0, 5));
await browser.close();
