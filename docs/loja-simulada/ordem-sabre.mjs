// Confere a ordem das linhas da Tabela de preços nos modelos com vários sabres (61, 272XP, 365): tamanho crescente dentro do modelo.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/ordem-sabre.mjs
import { open, check, step, finish, BASE } from './_t.mjs';
const { browser, page, errors } = await open({ theme: 'light' });
await step('sabres em ordem crescente dentro do modelo', async () => {
  await page.goto(BASE + '/tabela-de-precos');
  await page.locator('tbody tr').nth(1).waitFor({ timeout: 15000 });
  const linhas = await page.locator('tbody tr').allInnerTexts();
  const tamanhos = modelo => linhas
    .filter(linha => linha.split('\n')[0].trim() === modelo)
    .map(linha => Number((linha.split('\n')[1] ?? '').match(/(\d{1,2})["”]/)?.[1]));
  for (const modelo of ['61', '272XP', '365']) {
    const t = tamanhos(modelo);
    check(`${modelo}: sabres ${t.join(', ')}`, t.length > 1 && t.every((valor, i) => i === 0 || t[i - 1] <= valor));
  }
});
await finish(browser, errors);
