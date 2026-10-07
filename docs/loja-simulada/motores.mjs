// Painéis de motor (Briggs e Kawasaki) no atendimento, com todo o conteúdo.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/motores.mjs [tema=dark]
import { open, check, step, finish, shot, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'dark' });
const busca = page.getByPlaceholder(SEARCH);

async function pesquisar(texto) {
  await busca.fill(texto);
  await page.getByRole('button', { name: 'Buscar' }).click();
}

await step('Briggs', async () => {
  await pesquisar('104M02-0002-F1');
  const painel = page.getByRole('region', { name: /Motor Briggs/ });
  await painel.waitFor({ timeout: 40000 });
  check('painel Briggs abre com o modelo no título', (await painel.locator('h3').first().innerText()).includes('104M02'));
  const pdf = painel.getByRole('link', { name: /Lista de peças/ });
  check('botão da lista de peças oficial é link https', /^https:/.test((await pdf.getAttribute('href')) ?? ''));
  const primeira = painel.locator('article').first();
  await primeira.waitFor({ timeout: 60000 });
  const total = await painel.locator('article').count();
  const semCodigo = await painel.locator('article', { hasText: 'Sem código' }).count();
  check('a leitura do PDF traz peças com código', total > 20 && semCodigo === 0, `${total} peças`);

  // todo cabeçalho de conjunto tem peças e tem nome
  const grupos = await painel.locator('h4.sticky').allInnerTexts();
  check('há conjuntos nomeados e nenhum vazio', grupos.length > 0 && grupos.every(g => !/· 0$/.test(g.trim())), `${grupos.length} conjuntos`);

  // filtro
  const filtro = painel.getByLabel('Filtrar peças do motor');
  await filtro.fill('carb');
  await page.waitForTimeout(300);
  const filtradas = await painel.locator('article').count();
  check('filtro reduz a lista', filtradas > 0 && filtradas < total, `${total} → ${filtradas}`);
  await filtro.fill('zzzqqq');
  check('filtro sem resultado avisa', await painel.getByText(/Nada com "zzzqqq"/).isVisible());
  await filtro.fill('');

  // copiar código cru
  const botao = painel.locator('article button[aria-label^="Copiar código"]').first();
  const exibido = (await botao.innerText()).trim();
  await botao.click();
  const copiado = await page.evaluate(() => navigator.clipboard.readText());
  check('copiar põe o código como a Briggs publica (sem máscara Husqvarna)', copiado === exibido, `${exibido} → ${copiado}`);
  check('Briggs de 8 dígitos NÃO recebe a máscara Husqvarna', !(await painel.locator('article button[aria-label^="Copiar código"]').allInnerTexts()).some(t => /^\d{2} \d{2} \d{2}-\d{2}$/.test(t.trim())));

  // orçamento
  const linha = painel.locator('article').first();
  await linha.getByRole('button', { name: /^\+ Orçamento/ }).click();
  await page.waitForTimeout(500);
  check('+ Orçamento muda o botão', await linha.getByRole('button', { name: /No orçamento/ }).isVisible());

  // menu
  await linha.getByRole('button', { name: /Mais ações para/ }).click();
  check('menu da peça tem "Ver preço e estoque"', await page.getByRole('menuitem', { name: 'Ver preço e estoque' }).isVisible());
  await page.keyboard.press('Escape');

  // etiquetas de aviso: se alguma existe, está legível
  const etiquetas = await painel.locator('article span.rounded-md.text-sm.font-semibold').allInnerTexts();
  console.log(`   etiquetas de aviso nas peças: ${[...new Set(etiquetas)].slice(0, 8).join(' | ') || 'nenhuma'}`);

  await painel.scrollIntoViewIfNeeded();
  await shot(page, `${theme}-1366-motor-briggs`);
  await painel.locator('.overflow-y-auto').evaluate(el => { el.scrollTop = el.scrollHeight; });
  await page.waitForTimeout(300);
  await shot(page, `${theme}-1366-motor-briggs-fim`);
});

await step('Kawasaki', async () => {
  await pesquisar('FX921V-ES06');
  const painel = page.getByRole('region', { name: /Motor Kawasaki/ });
  await painel.waitFor({ timeout: 40000 });
  check('painel Kawasaki abre', await painel.isVisible());
  const conjuntos = painel.getByRole('button', { pressed: false });
  const n = await conjuntos.count();
  check('lista de conjuntos aparece', n > 0, `${n} conjuntos`);
  await conjuntos.first().click();
  await painel.locator('article').first().waitFor({ timeout: 40000 });
  const pecas = await painel.locator('article').count();
  check('abrir um conjunto traz peças com código', pecas > 0, `${pecas} peças`);
  const link = painel.getByRole('link', { name: /Ver vista explodida/ });
  check('link da vista explodida oficial existe', (await link.count()) > 0);
  const botao = painel.locator('article button[aria-label^="Copiar código"]').first();
  const exibido = (await botao.innerText()).trim();
  await botao.click();
  check('copiar mantém o hífen do código Kawasaki', (await page.evaluate(() => navigator.clipboard.readText())) === exibido && exibido.includes('-'), exibido);
  await painel.scrollIntoViewIfNeeded();
  await shot(page, `${theme}-1366-motor-kawasaki`);
});

await finish(browser, errors);
