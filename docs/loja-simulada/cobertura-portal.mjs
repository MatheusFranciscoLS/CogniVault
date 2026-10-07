// Abre Qualidade e espera a conferência automática no Portal terminar (38 rodadas de 8 modelos).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/cobertura-portal.mjs [tema]
import { open, check, step, finish, shot } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

await step('Qualidade confere o Portal sozinha', async () => {
  await page.getByRole('button', { name: 'Administração', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Qualidade' }).click();
  const andamento = page.getByText(/Conferindo os modelos no Portal/);
  await andamento.waitFor({ timeout: 20000 });
  check('a conferência começa sozinha', true);
  await shot(page, `${theme}-1366-qualidade-conferindo`);
  await page.getByText(/Todos os modelos já foram conferidos no Portal/).waitFor({ timeout: 280000 });
  check('a conferência termina e avisa', true);
  const texto = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
  console.log('   ', texto.slice(0, 700));
  check('o cartão "Sem fonte técnica" não diz mais "pendências"', !/Pendências priorizadas/.test(texto));
  await shot(page, `${theme}-1366-qualidade-conferida`);
});

await finish(browser, errors);
