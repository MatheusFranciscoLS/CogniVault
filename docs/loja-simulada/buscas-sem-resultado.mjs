// Buscas sem resultado (pedido do dono, 2026-10-09): o balcão procura algo que não existe e o TEXTO fica registrado, agregado, para o dono ver no Negócio.
// O que TEM resposta (peça no catálogo, preço no cadastro, máquina, código trocado pelo Portal) NÃO pode virar "sem resultado".
// Precisa de internet (Portal Husqvarna). Uso (de dentro de frontend/): node ../docs/loja-simulada/buscas-sem-resultado.mjs [tema]
import { open, check, step, finish, shot, sqlSim, SEARCH } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const campo = page.getByPlaceholder(SEARCH);
const posts = [];
page.on('request', r => { if (r.url().includes('/api/search/miss') && r.method() === 'POST') posts.push(r.postData()); });

const linhas = () => sqlSim(`SELECT "normalizedQuery" || '|' || "count" FROM "SearchMiss" ORDER BY "normalizedQuery"`).trim().split('\n').filter(Boolean);
const contagem = texto => Number((linhas().find(l => l.startsWith(texto + '|')) ?? '|0').split('|')[1]);
const buscar = async texto => {
  await campo.fill(texto);
  await campo.press('Enter');
  // A busca termina quando o botão volta a dizer "Buscar" (a fase "por significado" e o Portal acabam antes disso).
  await page.getByRole('button', { name: 'Buscar', exact: true }).waitFor({ timeout: 60000 });
  await page.waitForTimeout(2500);
};

sqlSim(`DELETE FROM "SearchMiss"`);

await step('Busca que não existe em lugar nenhum fica registrada, uma vez só', async () => {
  await buscar('zzqxkwv ptfy');
  check('o texto foi enviado ao servidor', posts.length === 1, posts.join(' '));
  check('a linha existe com contagem 1', contagem('zzqxkwv ptfy') === 1, linhas().join(' ; '));
  await buscar('zzqxkwv ptfy');
  check('repetir a mesma busca na mesma página não conta duas vezes', contagem('zzqxkwv ptfy') === 1 && posts.length === 1);
  await buscar('ZZQXKWV   Ptfy');
  check('outra caixa e espaços contam como a mesma busca', linhas().length === 1 && posts.length === 1);
});

await step('O que TEM resposta não vira "sem resultado"', async () => {
  const antes = linhas().length;
  await buscar('carburador 143RII');
  check('peça do catálogo: nada registrado', linhas().length === antes);
  await buscar('587106701');
  check('código do catálogo: nada registrado', linhas().length === antes);
  await buscar('Z460');
  check('modelo de máquina: nada registrado', linhas().length === antes);
  await buscar('ZZ999X');
  check('texto no formato de modelo de máquina: fica de fora (a consulta de máquina é outra, não dá para afirmar que faltou)', linhas().length === antes, linhas().join(' ; '));
  await buscar('506027201');
  check('código que o Portal substituiu: nada registrado (a faixa de troca responde)', linhas().length === antes, linhas().join(' ; '));
  check('nenhuma dessas buscas foi enviada ao servidor', posts.length === 1, String(posts.length));
});

await step('Código que ninguém conhece (nem o Portal) é registrado', async () => {
  await buscar('999999999');
  check('o código inexistente entrou', contagem('999999999') === 1, linhas().join(' ; '));
  // O Portal responde 404 para código que não conhece (a faixa de troca de código já fazia isso): ruído do navegador, não erro nosso.
  const antes404 = errors.length;
  for (let i = errors.length - 1; i >= 0; i--) if (/status of 404/.test(errors[i])) errors.splice(i, 1);
  check('só o 404 esperado do Portal foi descartado', antes404 - errors.length <= 2, String(antes404 - errors.length));
});

await step('O dono vê a lista no Negócio, a mais repetida primeiro, e dispensa', async () => {
  sqlSim(`UPDATE "SearchMiss" SET "count" = 7 WHERE "normalizedQuery" = 'zzqxkwv ptfy'`);
  await page.goto('http://127.0.0.1:5173/administracao/negocio?aba=demanda');
  const cartao = page.getByRole('region', { name: 'Buscas sem resultado' });
  await cartao.waitFor({ timeout: 30000 });
  await cartao.scrollIntoViewIfNeeded();
  const textos = (await cartao.locator('tbody tr').allInnerTexts()).map(t => t.replace(/\s+/g, ' '));
  check('a mais repetida vem primeiro', /^zzqxkwv ptfy 7/.test(textos[0] ?? ''), textos.join(' | '));
  check('mostra as duas buscas', textos.length === 2);
  await shot(page, `${theme}-1366-buscas-sem-resultado`);
  await cartao.getByRole('button', { name: 'Dispensar a busca zzqxkwv ptfy' }).click();
  await page.waitForTimeout(1200);
  check('dispensar tira da lista e do banco', linhas().length === 1 && (await cartao.locator('tbody tr').count()) === 1, linhas().join(' ; '));
});

await step('A rota recusa o que não pode', async () => {
  const base = 'http://127.0.0.1:5173/api';
  const cab = { Origin: 'http://127.0.0.1:5173', 'Content-Type': 'application/json' };
  const semLogin = await fetch(base + '/search/miss', { method: 'POST', headers: cab, body: JSON.stringify({ query: 'abc def' }) });
  check('sem login: 401', semLogin.status === 401, String(semLogin.status));
  const semLoginLista = await fetch(base + '/admin/search-misses', { headers: cab });
  check('listar sem login: 401', semLoginLista.status === 401);
  for (const query of ['joao@email.com', 'a', 'x'.repeat(200), 42]) {
    const r = await page.request.post(base + '/search/miss', { data: { query }, headers: cab });
    check(`texto inválido (${String(query).slice(0, 14)}): 400`, r.status() === 400, String(r.status()));
  }
  const ok = await page.request.post(base + '/search/miss', { data: { query: 'texto valido xyz' }, headers: cab });
  check('texto válido: 202', ok.status() === 202);
});

sqlSim(`DELETE FROM "SearchMiss"`);
await finish(browser, errors);
