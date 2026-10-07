// Avulso: sonda ao vivo do portal público para uma máquina (por PNC de 9 dígitos): o que `necessaryProducts`,
// `recommendedProducts`, `relatedTools`, `standardEquipment` e `relatedItems` trazem.
// Uso: node docs/loja-simulada/portal-probe.mjs 967332901 ...
const URL = 'https://portal.husqvarnagroup.com/hbd/graphql?';
const headers = { 'Content-Type': 'application/json', Accept: 'application/json', Origin: 'https://portal.husqvarnagroup.com', Referer: 'https://portal.husqvarnagroup.com/br/', 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36' };
const frag = '__typename ... on Machine { sku name { productName } } ... on Accessory { sku name { productName } } ... on DiamondTool { sku name { productName } }';
const query = `query probe($siteName: String!, $articleId: ID!) { site(name: $siteName) { articles { byIds(ids: [$articleId]) {
  id articleDescription name { productName } isDiscontinued
  product { __typename ... on Machine { necessaryProducts { ${frag} } recommendedProducts { ${frag} } } }
} } } }`;

for (const pnc of process.argv.slice(2)) {
  const r = await (await fetch(URL, { method: 'POST', headers, body: JSON.stringify({ query, variables: { siteName: 'b2b-br-pt-br', articleId: pnc } }) })).json();
  if (r.errors) { console.log(pnc, 'ERRO', r.errors.map(e => e.message).join(' | ').slice(0, 300)); continue; }
  const a = r.data?.site?.articles?.byIds?.[0];
  if (!a) { console.log(pnc, 'sem artigo'); continue; }
  const lista = l => (l ?? []).map(x => `${x.__typename}:${x.sku} ${x.name?.productName ?? ''}`.trim());
  console.log(`\n${pnc} ${a.name?.productName ?? ''} (${a.articleDescription})`);
  console.log('  precisa (necessaryProducts):', JSON.stringify(lista(a.product?.necessaryProducts)));
  console.log('  recomendados:', JSON.stringify(lista(a.product?.recommendedProducts)).slice(0, 400));
}
