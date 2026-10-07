// Avulso: para algumas máquinas da Tabela de preços, quantos acessórios o Portal informa e quantos têm preço no cadastro.
// Uso (de dentro de frontend/): node ../docs/loja-simulada/acessorios-portal.mjs
import { sqlSim } from './_t.mjs';

const BASE = 'http://127.0.0.1:3333';
const login = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' }, body: JSON.stringify({ email: 'admin.e2e@cognivault.local', password: 'CogniVault-E2E-2026!' }) });
const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const get = async url => (await fetch(BASE + url, { headers: { Cookie: cookie, Origin: 'http://127.0.0.1:5173' } })).json();

const linhas = sqlSim(`SELECT pnc || '|' || model || '|' || category FROM "MachineListing" WHERE pnc ~ '^[0-9]{9}$' AND category ~ '^(MOTOSSERRA|SOPRADOR|CORTADOR DE GRAMA|GIRO ZERO|RO.ADEIRA)$' ORDER BY random() LIMIT 8`).split('\n');
for (const linha of linhas) {
  const [pnc, model, category] = linha.split('|');
  const data = await get(`/api/husqvarna/products/${pnc}/details`);
  const acc = data.product?.accessories ?? [];
  const ids = acc.map(a => a.id);
  let priced = 0;
  if (ids.length) {
    const r = await (await fetch(BASE + '/api/master-parts/prices', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'application/json', Origin: 'http://127.0.0.1:5173' }, body: JSON.stringify({ codes: ids }) })).json();
    priced = Object.keys(r.prices ?? {}).length;
  }
  console.log(`${model.padEnd(14)} ${category.padEnd(18)} acessórios no Portal: ${String(acc.length).padStart(2)} | com preço no cadastro: ${priced} | ex.: ${acc.slice(0, 2).map(a => `${a.id} ${a.name}`).join(' ; ').slice(0, 90)}`);
}
