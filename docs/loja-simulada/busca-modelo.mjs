// O modelo PESQUISADO vem primeiro (dono, 2026-10-07: "122 HD60" mostrava 522HD60S, 522iHD60 e 536LiHD60X na frente).
// Digita o modelo, confere a ordem das fichas de máquina e dos documentos e que manual do operador não aparece.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/busca-modelo.mjs [tema] [modelo]
import { open, check, step, finish, shot, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const modelo = process.argv[3] ?? '122 HD60';
const chave = modelo.replace(/[^a-z0-9]/gi, '').toUpperCase();

await step(`busca por "${modelo}"`, async () => {
  await page.getByPlaceholder(SEARCH).fill(modelo);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fichas = page.locator('button:has(.font-code)', { hasText: 'PNC' });
  await fichas.first().waitFor({ timeout: 30000 });
  const textos = (await fichas.allInnerTexts()).map(t => t.replace(/\s+/g, ' ').trim());
  console.log('   fichas: ' + textos.slice(0, 6).join(' | '));
  const limpo = t => t.replace(/[^a-z0-9]/gi, '').toUpperCase();
  check('a primeira ficha é a do modelo pesquisado', limpo(textos[0]).includes(chave), textos[0]);
  const primeiroDeOutro = textos.findIndex(t => !limpo(t).includes(chave));
  const ultimoDoModelo = textos.map(limpo).map(t => t.includes(chave)).lastIndexOf(true);
  check('todas as fichas do modelo vêm antes das parecidas', primeiroDeOutro === -1 || primeiroDeOutro > ultimoDoModelo, `${ultimoDoModelo} / ${primeiroDeOutro}`);
  check('o nome da ficha mostra o MODELO (não é cortado antes dele)', textos.slice(0, 3).every(t => !/\.\.\.|…/.test(t)));

  const docs = page.getByRole('link').filter({ has: page.locator('svg') });
  const linksDoc = (await page.locator('a[href*="husqvarna"]').allInnerTexts()).map(t => t.trim()).filter(Boolean);
  console.log('   documentos: ' + linksDoc.slice(0, 5).join(' | '));
  check('nenhum atalho é manual do operador', !linksDoc.some(t => /^OM\b/i.test(t)));
  void docs;
  await shot(page, `${theme}-1366-busca-modelo`);
});

await finish(browser, errors);
