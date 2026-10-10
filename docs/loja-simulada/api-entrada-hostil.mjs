// ENTRADA HOSTIL NA API (2026-10-10, achado do fuzz de todas as rotas): caractere nulo (%00) no endereço, na busca ou no corpo dava 500 em 12 rotas (o Postgres o recusa dentro da
// consulta). Agora um portão antes das rotas devolve 400. Também confere que lixo de tipo errado, texto enorme e id inválido NÃO dão 500 nem vazam detalhe interno, e que
// texto normal (acento, emoji, aspas) continua passando. Só na loja simulada. Uso (de dentro de frontend/): node ../docs/loja-simulada/api-entrada-hostil.mjs [tema]
import { open, check, step, finish } from './_t.mjs';

const { browser, page, errors } = await open({ theme: process.argv[2] ?? 'light', width: 1366, height: 768 });
await page.goto('http://127.0.0.1:5173/atendimento');
await page.waitForTimeout(1500);
const API = 'http://127.0.0.1:3333';
const chamar = async (metodo, caminho, corpo) => {
  const r = await page.request.fetch(API + caminho, { method: metodo, headers: { 'Content-Type': 'application/json' }, data: corpo, timeout: 30000, failOnStatusCode: false });
  const texto = (await r.text()).slice(0, 500);
  return { status: r.status(), texto };
};
const vazaDetalhe = texto => /node_modules|at \w+ \(|PrismaClient|prisma\.\w+\.|invalid byte sequence|SELECT .* FROM|\\src\\|\/src\/.*\.ts/i.test(texto);

await step('Caractere nulo no endereço vira 400 (era 500), sem vazar detalhe', async () => {
  const rotas = [
    ['GET', '/api/parts/%00'], ['GET', '/api/quotes?q=%00'], ['GET', '/api/quotes/%00'], ['PATCH', '/api/quotes/%00'], ['DELETE', '/api/quotes/%00'],
    ['GET', '/api/documents/%00/access'], ['POST', '/api/documents/%00/archive'], ['DELETE', '/api/documents/%00'], ['DELETE', '/api/admin/search-misses/%00'],
    ['PATCH', '/api/admin/users/%00'], ['PATCH', '/api/admin/quality/catalogs/%00'], ['GET', '/api/search/fast?q=carb%00urador'],
  ];
  for (const [metodo, caminho] of rotas) {
    const r = await chamar(metodo, caminho, metodo === 'GET' || metodo === 'DELETE' ? undefined : '{}');
    check(`${metodo} ${caminho} -> 400`, r.status === 400 && !vazaDetalhe(r.texto), `${r.status} ${r.texto.slice(0, 80)}`);
  }
});

await step('Caractere nulo no corpo vira 400', async () => {
  const NUL = String.fromCharCode(0);
  for (const corpo of [{ customerName: 'Joao' + NUL + 'Silva', items: [] }, { itens: [{ nome: { fundo: NUL } }] }, { ['chave' + NUL]: 1 }]) {
    const r = await chamar('PUT', '/api/quotes/draft', JSON.stringify(corpo));
    check('PUT /api/quotes/draft com nulo no corpo -> 400', r.status === 400, `${r.status} ${r.texto.slice(0, 80)}`);
  }
  const r = await chamar('POST', '/api/search/miss', JSON.stringify({ query: 'abc' + NUL }));
  check('POST /api/search/miss com nulo -> 400', r.status === 400, `${r.status}`);
});

await step('Texto normal continua passando', async () => {
  for (const q of ['carburador%20143RII', encodeURIComponent('óleo 2T 😀'), encodeURIComponent("it's \"aspas\" \\ barra"), '506744201', '587%2010%2067-01']) {
    const r = await chamar('GET', `/api/quotes?q=${q}`);
    check(`GET /api/quotes?q=${decodeURIComponent(q).slice(0, 22)} -> 200`, r.status === 200, `${r.status}`);
  }
  const busca = await chamar('GET', '/api/parts/search?q=carburador%20143RII');
  check('busca de peça com acento/espaço segue respondendo (não 400 do portão)', busca.status !== 400 || !/nulo/.test(busca.texto), `${busca.status}`);
});

await step('Lixo que NÃO é nulo também nunca vira 500 nem vaza detalhe', async () => {
  const casos = [
    ['PUT', '/api/quotes/draft', '[]'], ['PUT', '/api/quotes/draft', 'null'], ['PUT', '/api/quotes/draft', '"texto"'], ['PUT', '/api/quotes/draft', '{'],
    ['POST', '/api/master-parts/prices', '{"codes":"naoelista"}'], ['POST', '/api/master-parts/prices', '{"codes":[null,1,{"a":1},"x"]}'],
    ['POST', '/api/search/miss', '{"query":' + JSON.stringify('A'.repeat(50000)) + '}'], ['POST', '/api/search/miss', '123'],
    ['GET', '/api/quotes/zz'], ['GET', '/api/quotes/' + '0'.repeat(2000)], ['GET', '/api/quotes?limit=-5&take=abc&page=-1'], ['GET', '/api/quotes?kind=XX'],
    ['GET', '/api/admin/repair-top?months=zz'], ['GET', '/api/admin/business-insights?from=zzz&to=yyy'], ['GET', "/api/parts/search?q='%20OR%201=1--"],
  ];
  for (const [metodo, caminho, corpo] of casos) {
    const r = await chamar(metodo, caminho, corpo);
    check(`${metodo} ${caminho.slice(0, 48)} -> ${r.status} (sem 500 e sem vazar)`, r.status < 500 && !vazaDetalhe(r.texto), `${r.status} ${r.texto.slice(0, 70)}`);
  }
});

await finish(browser, errors.filter(e => !/status of 40[0-9]/.test(e)));
