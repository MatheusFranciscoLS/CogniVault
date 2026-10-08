// Print da página INTEIRA de cada aba (rolagem completa), para revisar a tela toda. Não é teste.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/abas-paginas-inteiras.mjs [tema] [largura]
import { open } from './_t.mjs';
import path from 'node:path';

const theme = process.argv[2] ?? 'light';
const width = Number(process.argv[3] ?? 1366);
const { browser, page } = await open({ theme, width, height: width > 1500 ? 1080 : 768 });
const OUT = path.join(process.env.LOCALAPPDATA ?? '.', 'Temp', 'cvsim', 'shots');
for (const [nome, rota] of [['catalogos', '/catalogos'], ['orcamentos', '/orcamentos'], ['precos', '/tabela-de-precos'], ['negocio', '/administracao/negocio'], ['visao', '/administracao/visao-geral'], ['usuarios', '/administracao/usuarios'], ['qualidade', '/administracao/qualidade']]) {
  await page.goto('http://127.0.0.1:5173' + rota);
  await page.waitForTimeout(nome === 'qualidade' ? 6000 : 3000);
  await page.screenshot({ path: path.join(OUT, `full-${theme}-${width}-${nome}.png`), fullPage: true });
}
await browser.close();
