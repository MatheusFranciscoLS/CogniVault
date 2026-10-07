// Avulso: introspecção ao vivo do schema GraphQL PÚBLICO do portal Husqvarna, para auditar o que a integração usa
// e o que ainda não pede. Só lê (sem login); o portal responde a consultas públicas.
// Uso: node docs/loja-simulada/portal-schema.mjs [Tipo ...]
const URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const headers = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://portal.husqvarnagroup.com', Referer: 'https://portal.husqvarnagroup.com/br/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' };

const typeRef = t => (t.kind === 'NON_NULL' ? typeRef(t.ofType) + '!' : t.kind === 'LIST' ? `[${typeRef(t.ofType)}]` : t.name);
async function tipo(name) {
  const query = `{ __type(name: "${name}") { name kind fields { name type { kind name ofType { kind name ofType { kind name ofType { kind name } } } } } } }`;
  const r = await (await fetch(URL, { method: 'POST', headers, body: JSON.stringify({ query }) })).json();
  return r.data?.__type ?? null;
}

for (const nome of process.argv.slice(2)) {
  const t = await tipo(nome);
  if (!t) { console.log(`\n${nome}: não existe`); continue; }
  console.log(`\n${t.name} (${t.kind}): ${t.fields?.map(f => `${f.name}:${typeRef(f.type)}`).join(', ')}`);
}
