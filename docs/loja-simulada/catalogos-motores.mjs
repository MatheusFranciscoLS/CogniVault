// Catálogos: os PDFs de motor de TERCEIRO (Briggs, Kawasaki, Kohler) saíram da lista do balcão (dono, 2026-10-08). O Atendimento abre o catálogo oficial deles
// com vista explodida e preço. Aqui: a lista não os mostra nem oferece os botões antigos (sites externos e rota de PDF), a busca por um motor leva ao
// Atendimento, e a Biblioteca (Gerenciar) continua tendo os PDFs para o dono arquivar. Cria 3 documentos SÓ na loja simulada e apaga no fim.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/catalogos-motores.mjs [tema]
import { open, check, step, finish, shot, sqlSim } from './_t.mjs';

const MARCADOR = 'SIM-MOTOR-TESTE';
const docs = [
  { filename: `Motor Kawasaki FR691.pdf ${MARCADOR}`, manufacturer: 'Kawasaki', model: 'FR691V-AS29' },
  { filename: `Motor Briggs 12J902-0118-01 ${MARCADOR}.pdf`, manufacturer: 'Briggs & Stratton', model: '12J902-0118-01' },
  { filename: `Motor Kohler SV540 ${MARCADOR}.pdf`, manufacturer: 'Kohler', model: 'SV540-3212' },
];
const limpar = () => sqlSim(`DELETE FROM "Document" WHERE filename LIKE '%${MARCADOR}%'`);
limpar();
const tenant = sqlSim(`SELECT "tenantId" FROM "Document" LIMIT 1`);
for (const doc of docs) {
  sqlSim(`INSERT INTO "Document" (id, "tenantId", filename, url, status, manufacturer, model) VALUES (gen_random_uuid()::text, '${tenant}', '${doc.filename}', 'sim://${MARCADOR}', 'COMPLETED', '${doc.manufacturer}', '${doc.model}')`);
}

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const irParaCatalogos = async () => { await page.goto('http://127.0.0.1:5173/catalogos'); await page.getByRole('heading', { name: 'Catálogos' }).waitFor({ timeout: 20000 }); await page.waitForTimeout(800); };
const busca = () => page.getByRole('textbox', { name: /Buscar catálogo/ });
const linhas = () => page.locator('tbody tr');

try {
  await step('A lista do balcão não mostra PDF de motor Briggs/Kawasaki/Kohler nem os botões antigos', async () => {
    await irParaCatalogos();
    const texto = await page.locator('main').innerText();
    check('nenhum motor de terceiro na lista', !/Motor (Kawasaki|Briggs|Kohler)/i.test(texto) && !texto.includes(MARCADOR));
    check('sem "Lista de peças Briggs", "Todos os manuais" nem "Catálogo Kawasaki"', !/Lista de peças Briggs|Todos os manuais|Catálogo Kawasaki/.test(texto));
    check('os catálogos Husqvarna continuam na lista', (await linhas().count()) >= 10, String(await linhas().count()));
    const meta = (await page.locator('main').innerText()).match(/(\d+) catálogos/);
    check('o contador acompanha a lista (não conta o que saiu)', Boolean(meta) && Number(meta[1]) === (await linhas().count()), `${meta?.[0]} / ${await linhas().count()} linhas`);
    await shot(page, `${theme}-1366-catalogos-sem-motores`);
  });

  for (const [termo, esperado, regiao] of [
    ['FR691V', 'FR691V-AS29', /Motor Kawasaki FR691V-AS29/],
    ['fr691v', 'FR691V-AS29', /Motor Kawasaki FR691V-AS29/],
    ['12J902', '12J902-0118-01', /Briggs|12J902/i],
    ['kohler', 'SV540-3212', /Motor Kohler SV540-3212/],
  ]) {
    await step(`Buscar "${termo}": a lista não tem o motor, mas há atalho para o catálogo dele no Atendimento`, async () => {
      await irParaCatalogos();
      await busca().fill(termo);
      const atalho = page.getByRole('button', { name: esperado });
      await atalho.waitFor({ timeout: 10000 });
      check('mostra o aviso e o botão do motor', /Motor com catálogo no Atendimento/.test(await page.locator('main').innerText()));
      check('nenhuma linha de PDF de motor na tabela', !(await linhas().allInnerTexts()).some(texto => texto.includes(MARCADOR)));
      await atalho.click();
      await page.getByRole('region', { name: regiao }).first().waitFor({ timeout: 60000 });
      check('o clique abre o catálogo oficial do motor no Atendimento', /\/atendimento/.test(page.url()), page.url());
    });
  }

  await step('Busca sem motor e busca Husqvarna: nada de atalho fora de hora', async () => {
    await irParaCatalogos();
    await busca().fill('zzzzzz');
    await page.waitForTimeout(500);
    check('texto sem resultado não oferece atalho', !/Motor com catálogo no Atendimento/.test(await page.locator('main').innerText()));
    await busca().fill('143');
    await page.waitForTimeout(500);
    check('modelo Husqvarna acha as linhas e não oferece atalho de motor', (await linhas().count()) >= 1 && !/Motor com catálogo no Atendimento/.test(await page.locator('main').innerText()));
  });

  await step('A Biblioteca (Gerenciar biblioteca) continua com os PDFs de motor, para o dono arquivar', async () => {
    await irParaCatalogos();
    await page.getByRole('button', { name: 'Gerenciar biblioteca' }).click();
    await page.getByRole('heading', { name: 'Biblioteca de catálogos' }).waitFor({ timeout: 20000 });
    await page.waitForTimeout(1500);
    const texto = await page.locator('main').innerText();
    check('a Biblioteca conta os 3 motores de teste além dos 61 da lista (64)', /64 catálogos/.test(texto), texto.slice(0, 120).replace(/\s+/g, ' '));
    check('e mostra os modelos deles', /FR691V-AS29/.test(texto) && /SV540-3212/.test(texto) && /12J902-0118-01/.test(texto));
  });
} finally {
  limpar();
}

await finish(browser, errors);
