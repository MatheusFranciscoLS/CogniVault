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

// ---- Trava anti-robô da Kohler (medida em 2026-10-08): simulada com page.route, sem encostar na Kohler. ----
// Spec que a tela ainda não pediu: o resultado já lido de SV540-3212 está em cache na própria tela e esconderia o bloqueio simulado.
const SPEC_TESTE = 'SV541-3299';
const OFICIAL = `https://partnersportal.kohlerpower.it/customer/servicepartscatalogue/partfinder?EngineMatNumber=${SPEC_TESTE}`;
const motorIndisponivel = unavailable => ({ kohler: { spec: SPEC_TESTE, description: null, groups: [], catalogUrl: OFICIAL, lookupUrl: OFICIAL, unavailable } });
const motorLido = { kohler: { spec: SPEC_TESTE, description: 'Motor de Teste', groups: [{ sectionId: '101', groupCode: '01', name: 'Eixo de Teste' }], catalogUrl: OFICIAL, lookupUrl: OFICIAL } };

await step('Trava anti-robô · o motor não é lido: a tela explica, NÃO diz "sem catálogo", e "Tentar de novo" recupera', async () => {
  // O painel da máquina do passo anterior fica aberto: fecha antes de buscar.
  if (await page.getByRole('dialog').count()) { await page.locator('[role="dialog"] button[aria-label="Fechar"]').first().click(); await page.waitForTimeout(500); }
  await page.route('**/api/kohler/engine*', route => route.fulfill({ json: motorIndisponivel('CAPTCHA') }));
  await page.getByPlaceholder(SEARCH).fill(SPEC_TESTE);
  await page.getByRole('button', { name: 'Buscar' }).click();
  const painel = page.getByRole('region', { name: new RegExp(`Motor Kohler ${SPEC_TESTE}`) });
  await painel.getByRole('alert').waitFor({ timeout: 20000 });
  const texto = await painel.innerText();
  check('explica a verificação anti-robô', /verificação anti-robô/.test(texto));
  check('não diz "Sem catálogo" (não é falta de catálogo)', !/Sem catálogo/.test(texto));
  check('oferece o catálogo oficial e tentar de novo', (await painel.getByRole('link', { name: /Abrir o catálogo oficial/ }).count()) === 1 && (await painel.getByRole('button', { name: 'Tentar de novo' }).count()) === 1);
  check('o link oficial é do domínio da Kohler', (await painel.getByRole('link', { name: /Abrir o catálogo oficial/ }).getAttribute('href')).startsWith('https://partnersportal.kohlerpower.it/'));
  await shot(page, `${theme}-1366-kohler-captcha`);
  await page.unroute('**/api/kohler/engine*');
  await page.route('**/api/kohler/engine*', route => route.fulfill({ json: motorLido }));
  await painel.getByRole('button', { name: 'Tentar de novo' }).click();
  await painel.getByRole('button', { name: 'Eixo de Teste' }).waitFor({ timeout: 40000 });
  await page.unroute('**/api/kohler/engine*');
  check('depois de "Tentar de novo" o catálogo carrega e o aviso some', (await painel.getByRole('alert').count()) === 0);
});

await step('Trava anti-robô · um GRUPO que não foi lido mostra o aviso, não "Sem peças neste grupo"; e a segunda tentativa funciona', async () => {
  // O painel da máquina do passo anterior fica aberto: fecha antes de buscar.
  if (await page.getByRole('dialog').count()) { await page.locator('[role="dialog"] button[aria-label="Fechar"]').first().click(); await page.waitForTimeout(500); }
  await page.route('**/api/kohler/group*', route => route.fulfill({ json: { group: { title: null, parts: [], imageUrl: null, hotspots: [], referenceWidth: null, referenceHeight: null, unavailable: 'ERRO' } } }));
  await page.getByPlaceholder(SEARCH).fill('SV540-3212');
  await page.getByRole('button', { name: 'Buscar' }).click();
  const painel = page.getByRole('region', { name: /Motor Kohler SV540-3212/ });
  await painel.getByRole('button', { name: 'CrankCase' }).click();
  await painel.getByRole('alert').waitFor({ timeout: 20000 });
  const texto = await painel.innerText();
  check('diz que a Kohler não respondeu', /não respondeu/.test(texto));
  check('não diz "Sem peças neste grupo"', !/Sem peças neste grupo/.test(texto));
  await page.unroute('**/api/kohler/group*');
  await painel.getByRole('button', { name: 'Tentar de novo' }).click();
  await painel.locator('article').first().waitFor({ timeout: 40000 });
  check('a segunda tentativa traz as peças do grupo', (await painel.locator('article').count()) > 3);
});

await step('Trava anti-robô no desenho · a lista de peças do CSV aparece como reserva, avisando que falta o desenho', async () => {
  if (await page.getByRole('dialog').count()) { await page.locator('[role="dialog"] button[aria-label="Fechar"]').first().click(); await page.waitForTimeout(500); }
  const peca = { position: '1', partNumber: '00 000 01-S', name: 'EIXO DE TESTE', quantity: 1, note: null, kit: null, includedIn: null, replaces: [], replacedBy: [], discontinued: false };
  await page.route('**/api/kohler/group*', route => route.fulfill({ json: { group: { title: 'Lubrication - Group: 03', parts: [peca], imageUrl: null, hotspots: [], referenceWidth: null, referenceHeight: null, unavailable: 'CAPTCHA', partial: true } } }));
  await page.getByPlaceholder(SEARCH).fill('SV540-3212');
  await page.getByRole('button', { name: 'Buscar' }).click();
  const painel = page.getByRole('region', { name: /Motor Kohler SV540-3212/ });
  await painel.getByRole('button', { name: 'Lubrication' }).click();
  await painel.getByRole('alert').waitFor({ timeout: 20000 });
  const texto = await painel.innerText();
  check('avisa que falta o desenho e que a lista está abaixo', /sem o desenho/.test(texto) && /lista de peças/.test(texto));
  check('a peça do CSV aparece na lista', (await painel.locator('article').count()) === 1 && /00 000 01-S/.test(texto));
  check('não diz "Sem peças neste grupo"', !/Sem peças neste grupo/.test(texto));
  check('continua oferecendo tentar de novo e o catálogo oficial', (await painel.getByRole('button', { name: 'Tentar de novo' }).count()) === 1 && (await painel.getByRole('link', { name: /Abrir o catálogo oficial/ }).count()) === 1);
  await page.unroute('**/api/kohler/group*');
});

await finish(browser, errors);
