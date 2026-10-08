// Motor Kohler (catálogo com vista explodida) e o vínculo motor <-> máquina (dono, 2026-10-08).
// Precisa de internet até partnersportal.kohlerpower.it e portal.husqvarnagroup.com.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/motor-kohler.mjs [tema]
import { open, check, step, finish, shot, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });

await step('spec Kohler digitado abre o catálogo do motor (e não o do Briggs)', async () => {
  await page.getByPlaceholder(SEARCH).fill('SV540-3212');
  await page.getByRole('button', { name: 'Buscar' }).click();
  const painel = page.getByRole('region', { name: /Motor Kohler SV540-3212/ });
  await painel.waitFor({ timeout: 40000 });
  check('o painel diz o nome do motor', /Courage Single/.test(await painel.innerText()));
  check('não abriu o painel da Briggs', (await page.getByRole('region', { name: /Briggs/i }).count()) === 0);
  await painel.getByRole('button', { name: 'CrankShaft' }).click();
  await painel.locator('article').first().waitFor({ timeout: 40000 });
  const linhas = await painel.locator('article').count();
  check('o grupo mostra as 7 peças do eixo', linhas === 7, String(linhas));
  check('a vista explodida aparece com posições clicáveis', (await painel.locator('img').count()) > 0 && (await painel.getByRole('button', { name: /^[1-8]$/ }).count()) > 0);
  check('um código novo sem hífen quebrado: "20 014 47-S" aparece como a Kohler publica', (await painel.innerText()).includes('20 014 47-S'));
  const substituida = painel.locator('article', { hasText: '20 186 06-S' });
  check('a peça substituída/descontinuada diz isso', /Descontinuada/.test(await substituida.innerText()));
  await shot(page, `${theme}-1366-kohler-grupo`);
});

await step('spec que a Kohler não conhece cai no aviso com o link oficial, sem erro', async () => {
  await page.getByPlaceholder(SEARCH).fill('XX999-0000');
  await page.getByRole('button', { name: 'Buscar' }).click();
  const painel = page.getByRole('region', { name: /Motor Kohler XX999-0000/ });
  await painel.waitFor({ timeout: 40000 });
  check('mostra "Sem catálogo" e o link oficial', /Sem catálogo/.test(await painel.innerText()) && (await painel.getByRole('link', { name: /Catálogo oficial/ }).count()) === 1);
});

await step('máquina com motor vinculado: LTH1842 mostra o motor Kohler e abre a vista explodida dele', async () => {
  await page.getByPlaceholder(SEARCH).fill('LTH1842');
  await page.getByRole('button', { name: 'Buscar' }).click();
  const fichas = page.locator('button:has(.font-code)', { hasText: 'PNC' });
  await fichas.first().waitFor({ timeout: 40000 });
  await fichas.first().click();
  const cartao = page.getByRole('region', { name: 'Motor desta máquina' });
  await cartao.waitFor({ timeout: 40000 });
  const texto = await cartao.innerText();
  check('mostra SV540-3212 e a marca Kohler', /SV540-3212/.test(texto) && /Kohler/.test(texto));
  check('manda conferir a plaqueta ou o número de série do motor', /plaqueta/.test(texto) && /número de série/.test(texto));
  await cartao.getByRole('button', { name: 'Ver peças e vista explodida' }).click();
  await page.getByRole('region', { name: /Motor Kohler SV540-3212/ }).waitFor({ timeout: 40000 });
  check('o catálogo do motor abre dentro do painel da máquina', true);
  await shot(page, `${theme}-1366-maquina-motor`);
});

await finish(browser, errors);
