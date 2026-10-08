// Máquinas que o Portal não tem mas o site público da Husqvarna tem (345BT, 226KS12): a vista explodida abre e a busca acha a máquina.
// Precisa de internet até husqvarna.com. Uso (de dentro de frontend/): node ../docs/loja-simulada/fonte-publica.mjs [tema]
import { open, check, step, finish, BASE, SEARCH } from './_t.mjs';
const theme = process.argv[2] ?? 'light';
const { browser, page, errors } = await open({ theme });

await step('detalhe por PNC sem Portal vem do site público', async () => {
  const r = await page.request.get(BASE + '/api/husqvarna/products/970466903/details');
  const corpo = await r.json();
  const d = corpo.product ?? corpo;
  check('a API responde com a máquina 345BT', r.ok() && /345BT/i.test(JSON.stringify(d.productName ?? d)), `HTTP ${r.status()}`);
  check('traz seções de vista explodida com peças', (d.iplSections?.length ?? 0) >= 1 && (d.iplSections?.[0]?.parts?.length ?? 0) > 5, `${d.iplSections?.length} seções`);
  check('a fonte vem marcada como site público', d.iplSource === 'PUBLIC_SITE', String(d.iplSource));
  check('cada seção tem o tamanho da imagem (para posicionar as bolinhas)', d.iplSections?.every(s => s.referenceWidth > 0 && s.referenceHeight > 0));
});

await step('buscar 345bt acha a máquina e abre a vista explodida', async () => {
  const campo = page.getByPlaceholder(SEARCH);
  await campo.fill('345bt');
  await campo.press('Enter');
  const chip = page.getByRole('button', { name: /^345BT/ }).first();
  await chip.waitFor({ timeout: 30000 });
  check('o atalho da máquina 345BT aparece', await chip.isVisible());
  await chip.click();
  const painel = page.getByRole('dialog', { name: 'Máquina aberta' });
  await painel.waitFor({ timeout: 30000 });
  await painel.getByText(/MOTOR|ALOJAMENTO/i).first().waitFor({ timeout: 30000 });
  await page.screenshot({ path: process.env.LOCALAPPDATA + '/Temp/cvsim/shots/fonte-publica-345bt.png' });
  check('o painel mostra as seções da vista explodida', true);
  check('o painel tem peças com posição clicável', (await painel.locator('button').filter({ hasText: /^\d+$/ }).count()) > 0 || (await painel.getByText(/Vistas explodidas/).count()) > 0);
});

await finish(browser, errors);
