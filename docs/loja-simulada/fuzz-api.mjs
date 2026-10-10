// FUZZ DE TODAS AS ROTAS da API (2026-10-10), SÓ na loja simulada: lixo em cada rota (id inválido, texto enorme, nulo, aspas, emoji, tipo errado) procurando 500, lentidão e vazamento de detalhe interno.
// Lê as rotas de backend/src/routes/index.ts. ~2.600 chamadas, 8 em paralelo, uns 10 min. Cada achado é gravado na hora em $FUZZ_OUT (para não perder nada se o tempo acabar).
// As duas exportações CSV podem estourar 20 s sob a carga de 8 chamadas em paralelo: não é defeito (isoladas levam 0,1 s e 5 s).
// Uso (de dentro de frontend/): FUZZ_OUT=achados.txt node ../docs/loja-simulada/fuzz-api.mjs
import fs from 'node:fs';
import { open } from './_t.mjs';

const fonte = fs.readFileSync(new URL('../../backend/src/routes/index.ts', import.meta.url), 'utf8');
const rotas = [...fonte.matchAll(/router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g)].map(m => ({ metodo: m[1].toUpperCase(), caminho: m[2] }))
  .filter(r => !/logout|login/.test(r.caminho));
const unicas = [...new Map(rotas.map(r => [`${r.metodo} ${r.caminho}`, r])).values()];

const { browser, page } = await open({ theme: 'light', width: 1366, height: 768 });
await page.goto('http://127.0.0.1:5173/atendimento');
await page.waitForTimeout(1500);

const GRANDE = 'A'.repeat(100_000);
const parametrosDeCaminho = ['zz', '%00', '0'.repeat(2000), "'%3B%20DROP"];
const consultas = ['', '?q=' + encodeURIComponent('A'.repeat(20000)), '?q=%00', "?q='%20OR%201=1--", '?q=' + encodeURIComponent('😀'.repeat(200)), '?limit=-5&take=abc&page=-1', '?months=zz&from=zzz&to=yyy&kind=XX', '?pnc=' + encodeURIComponent('9'.repeat(300)) + '&model=' + encodeURIComponent('%'.repeat(100))];
const corpos = [undefined, '{}', '[]', 'null', '"texto"', '{"codes":"naoelista","items":"x","email":123,"password":[],"name":{},"id":"zz","status":"INVENTADO","role":"SUPER","percentage":"abc","price":-1,"quantity":1e309}', '{', '{"q":' + JSON.stringify('A'.repeat(50000)) + '}'];

const achados = [];
const vistos = new Set();
async function chamar(metodo, url, corpo) {
  const t0 = Date.now();
  try {
    const opcoes = { method: metodo, headers: { 'Content-Type': 'application/json' }, data: corpo, timeout: 20000, failOnStatusCode: false, maxRedirects: 0 };
    const r = await page.request.fetch(url, opcoes);
    const ms = Date.now() - t0;
    const status = r.status();
    let texto = '';
    try { texto = (await r.text()).slice(0, 600); } catch { /* sem corpo */ }
    const vaza = /node_modules|at \w+ \(|at Object\.|PrismaClient|prisma\.\w+\.|invocation|SELECT .* FROM|\\src\\|\/src\/.*\.ts|ECONNREFUSED|stack/i.test(texto);
    const chave = `${metodo} ${url.replace(/\?.*$/, '').replace(/\/zz|\/%00.*|\/0{20,}.*|\/-1|\/1e309|\/00000000-.*|\/'.*|\/%F0.*|\/\.\..*/, '/:p')} ${status >= 500 ? '5xx' : vaza ? 'vaza' : ms > 5000 ? 'lenta' : 'ok'}`;
    if ((status >= 500 || vaza || ms > 5000) && !vistos.has(chave)) {
      vistos.add(chave);
      fs.appendFileSync(process.env.FUZZ_OUT, '- ' + metodo + ' ' + url.slice(0, 120) + ' -> ' + status + ' (' + ms + ' ms)' + (vaza ? ' [VAZA]' : '') + ' :: ' + texto.replace(/\s+/g, ' ').slice(0, 200) + '\n'); achados.push({ metodo, url: url.length > 110 ? url.slice(0, 110) + '…' : url, status, ms, corpo: corpo ? String(corpo).slice(0, 50) : '', resposta: texto.replace(/\s+/g, ' ').slice(0, 220), vaza });
    }
    return status;
  } catch (e) {
    const ms = Date.now() - t0;
    const chave = `${metodo} ${url.replace(/\?.*$/, '')} erro`;
    if (!vistos.has(chave)) { vistos.add(chave); achados.push({ metodo, url: url.slice(0, 110), status: 'ERRO DE REDE/TIMEOUT', ms, corpo: corpo ? String(corpo).slice(0, 50) : '', resposta: String(e.message).split('\n')[0].slice(0, 160) }); }
    return 0;
  }
}

let total = 0;
const tarefas = [];
for (const r of unicas) {
  const base = 'http://127.0.0.1:3333/api' + r.caminho.replace(/^\/api/, '');
  const temParametro = /:/.test(base);
  const caminhos = temParametro ? parametrosDeCaminho.map(p => base.replace(/:[A-Za-z]+/g, p)) : [base];
  for (const caminho of caminhos) {
    if (r.metodo === 'GET' || r.metodo === 'DELETE') { for (const q of consultas) tarefas.push([r.metodo, caminho + q, undefined]); }
    else { for (const c of corpos) tarefas.push([r.metodo, caminho, c]); }
  }
}
let indice = 0;
await Promise.all(Array.from({ length: 8 }, async () => { while (indice < tarefas.length) { const [m, u, c] = tarefas[indice++]; total += 1; await chamar(m, u, c); } }));
console.log(`rotas: ${unicas.length} | chamadas: ${total} | achados: ${achados.length}`);
for (const a of achados) console.log(`- ${a.metodo} ${a.url} -> ${a.status} (${a.ms} ms)${a.vaza ? ' [VAZA DETALHE]' : ''}${a.corpo ? ' corpo=' + a.corpo : ''}\n    ${a.resposta}`);
await browser.close();
