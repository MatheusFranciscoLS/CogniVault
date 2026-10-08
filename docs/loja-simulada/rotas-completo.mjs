// Cada tela tem endereço próprio: troca de aba reescreve a barra, recarregar volta para a mesma tela,
// link antigo (/dashboard?tab=) é traduzido e o título da aba do navegador diz onde o atendente está.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/rotas-completo.mjs
import { open, check, step, finish, BASE, SEARCH } from './_t.mjs';

const { browser, page, errors } = await open({ theme: 'light' });
const caminho = () => new URL(page.url()).pathname;

await step('entrar leva ao Atendimento', async () => {
  check('o painel abre em /atendimento', caminho() === '/atendimento', page.url().replace(BASE, ''));
  check('o título da aba do navegador é Atendimento', /^Atendimento · /.test(await page.title()), await page.title());
});

const abas = [
  ['Catálogos', null, '/catalogos', /^Catálogos · /],
  ['Orçamentos', null, '/orcamentos', /^Orçamentos · /],
  ['Tabela de preços', null, '/tabela-de-precos', /^Tabela de preços · /],
  ['Administração', 'Negócio', '/administracao/negocio', /^Negócio · /],
  ['Administração', 'Visão geral', '/administracao/visao-geral', /^Visão geral · /],
  ['Administração', 'Usuários', '/administracao/usuarios', /^Usuários · /],
  ['Administração', 'Qualidade', '/administracao/qualidade', /^Qualidade · /],
];
for (const [aba, item, esperado, titulo] of abas) {
  await step(`${item ?? aba}: endereço ${esperado}`, async () => {
    await page.getByRole('button', { name: aba, exact: true }).click();
    if (item) await page.getByRole('menuitem', { name: item }).click();
    await page.waitForTimeout(500);
    check(`${item ?? aba} abre em ${esperado}`, caminho() === esperado, caminho());
    check(`${item ?? aba}: o título da aba do navegador acompanha`, titulo.test(await page.title()), await page.title());
  });
}

await step('recarregar na Qualidade volta para a Qualidade', async () => {
  await page.reload();
  await page.getByRole('heading', { name: 'Qualidade', level: 1 }).waitFor({ timeout: 20000 });
  check('o endereço continua /administracao/qualidade', caminho() === '/administracao/qualidade', caminho());
});

await step('link antigo ?tab= é traduzido', async () => {
  await page.goto(BASE + '/dashboard?tab=quotes');
  await page.waitForTimeout(800);
  check('/dashboard?tab=quotes vira /orcamentos', caminho() === '/orcamentos', page.url().replace(BASE, ''));
  await page.goto(BASE + '/dashboard?tab=machines&pnc=967332901');
  await page.waitForTimeout(800);
  check('/dashboard?tab=machines cai no Atendimento', caminho() === '/atendimento', page.url().replace(BASE, ''));
});

await step('a busca fica no endereço do Atendimento', async () => {
  await page.goto(BASE + '/atendimento');
  const campo = page.getByPlaceholder(SEARCH);
  await campo.waitFor({ timeout: 20000 });
  await campo.fill('143RII');
  await campo.press('Enter');
  await page.waitForTimeout(1200);
  check('a busca vira /atendimento?q=143RII', caminho() === '/atendimento' && new URL(page.url()).searchParams.get('q') === '143RII', page.url().replace(BASE, ''));
});

await step('endereço desconhecido cai no Atendimento', async () => {
  await page.goto(BASE + '/qualquer-coisa');
  await page.getByPlaceholder(SEARCH).waitFor({ timeout: 20000 });
  check('/qualquer-coisa vira /atendimento', caminho() === '/atendimento', caminho());
});

await finish(browser, errors);
