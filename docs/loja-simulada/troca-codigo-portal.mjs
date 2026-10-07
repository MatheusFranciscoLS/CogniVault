// Avulso: o que o sistema devolve para um código ANTIGO digitado no balcão (busca comercial, consulta oficial e dados ao vivo).
// Uso (de dentro de frontend/): node ../docs/loja-simulada/troca-codigo-portal.mjs 586931401 532196495 ...
const BASE = 'http://127.0.0.1:3333';
const origem = { Origin: 'http://127.0.0.1:5173' };
const login = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json', ...origem }, body: JSON.stringify({ email: 'admin.e2e@cognivault.local', password: 'CogniVault-E2E-2026!' }) });
const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
const get = async url => { const r = await fetch(BASE + url, { headers: { Cookie: cookie, ...origem } }); return { status: r.status, body: await r.json().catch(() => null) }; };

for (const code of process.argv.slice(2)) {
  console.log(`\n=== código digitado: ${code}`);
  const comercial = await get(`/api/master-parts/search?q=${code}`);
  console.log(`busca comercial: ${comercial.status} → ${(comercial.body?.parts ?? []).map(p => `${p.partNumber}${p.succession ? ' [' + JSON.stringify(p.succession) + ']' : ''}`).join(', ') || 'nenhuma peça'}`);
  const oficial = await get(`/api/official-fallback?q=${code}`);
  const r = oficial.body?.result ?? {};
  console.log(`  mais recente segundo o Portal: ${r.latestReplacementPartNumber ?? '-'} | histórico: ${(r.replacementHistory ?? []).map(h => h.partNumber).join(' > ') || '-'} | completo: ${r.replacementHistoryComplete}`);
  console.log(`consulta oficial: ${oficial.status} → status ${r.status} kind ${r.kind ?? '-'} nome ${r.name ?? r.partName ?? '-'} | substituído por: ${r.replacedBy ?? r.latestReplacementPartNumber ?? '-'} | cadeia: ${JSON.stringify(r.replacementChain ?? [])}`);
  const vivo = await get(`/api/parts/${code}/live-data`);
  const l = vivo.body?.livePart ?? {};
  console.log(`dados ao vivo: ${vivo.status} → nome ${l.name ?? '-'} | substituído por: ${l.replacedBy ?? '-'}`);
}
