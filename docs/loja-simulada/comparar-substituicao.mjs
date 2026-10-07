// Avulso: compara a cadeia de "similaridade" da lista de preços com o histórico de substituição do PORTAL para uma
// amostra de códigos antigos. Lê a lista de um caminho local (fora do repositório) e o Portal pelo backend da simulação.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/comparar-substituicao.mjs "<lista.html>" [quantidade=40]
import { readFileSync } from 'node:fs';

const html = readFileSync(process.argv[2], 'utf8');
const quantidade = Number(process.argv[3] ?? 40);
const a = html.indexOf('<script id="catalogData"');
const s = html.indexOf('>', a) + 1;
const catalogo = JSON.parse(html.slice(s, html.indexOf('</script>', s)));
const norm = c => String(c).toUpperCase().replace(/[^A-Z0-9]/g, '');

// Amostra determinística: todo o k-ésimo código antigo de peças de 9 dígitos.
const antigos = [];
for (const [chave, grupo] of Object.entries(catalogo.similaridade.pecas)) {
  const vigente = norm(chave);
  const novos = grupo.c.filter(x => x[2] === 2).map(x => norm(x[0]));
  for (const [codigo, , marca] of grupo.c) if (marca === 0 && /^\d{9}$/.test(norm(codigo))) antigos.push({ codigo: norm(codigo), vigente, novos, tamanho: grupo.c.length });
}
const passo = Math.max(1, Math.floor(antigos.length / quantidade));
const amostra = antigos.filter((_, i) => i % passo === 0).slice(0, quantidade);

const BASE = 'http://127.0.0.1:3333'; const origem = { Origin: 'http://127.0.0.1:5173' };
const login = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...origem }, body: JSON.stringify({ email: 'admin.e2e@cognivault.local', password: 'CogniVault-E2E-2026!' }) });
const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');

const contagem = { igual: 0, 'portal mais novo = "mais novo fora da lista"': 0, 'portal sem histórico': 0, 'portal diz que o código já é o mais recente': 0, diferente: 0, 'portal não respondeu': 0 };
const diferentes = [];
for (const item of amostra) {
  let p;
  try { p = (await (await fetch(`${BASE}/api/husqvarna/parts/${item.codigo}/details`, { headers: { Cookie: cookie, ...origem } })).json()).part; } catch { p = null; }
  if (!p) { contagem['portal não respondeu'] += 1; continue; }
  const portal = norm(p.latestReplacementPartNumber ?? '');
  if (!portal) { contagem['portal sem histórico'] += 1; continue; }
  if (portal === item.codigo) { contagem['portal diz que o código já é o mais recente'] += 1; diferentes.push(`${item.codigo}: Portal diz que ELE é o mais recente; a lista diz vigente ${item.vigente}`); continue; }
  if (portal === item.vigente) contagem.igual += 1;
  else if (item.novos.includes(portal)) contagem['portal mais novo = "mais novo fora da lista"'] += 1;
  else { contagem.diferente += 1; diferentes.push(`${item.codigo}: lista ${item.vigente} (cadeia de ${item.tamanho}) × Portal ${portal}`); }
}
console.log(`amostra: ${amostra.length} códigos antigos de peças (de ${antigos.length})`);
console.log(contagem);
console.log(diferentes.slice(0, 15).join('\n'));
