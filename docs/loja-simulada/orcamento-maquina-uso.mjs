// USO RECOMENDADO no orçamento de MÁQUINA (site público da Husqvarna): classe de uso e sabres compatíveis entram como característica marcada.
// Testa vários modelos e os casos em que NÃO deve aparecer nada (roçadeira, máquina fora do site, site fora do ar, resposta torta).
// Precisa de internet até husqvarna.com e da lista de máquinas importada na loja simulada. Uso (de dentro de frontend/): node ../docs/loja-simulada/orcamento-maquina-uso.mjs [tema]
import path from 'node:path';
import fs from 'node:fs';
import { open, check, step, finish, shot, sqlSim, OUT } from './_t.mjs';

const { browser, page, errors, theme } = await open({ theme: process.argv[2] ?? 'light' });
const falhas = [];
page.on('response', r => { if (r.status() >= 400 && !/public-specs/.test(r.url())) falhas.push(`${r.status()} ${new URL(r.url()).pathname}`); });
const listado = (modelo, indice = 0) => sqlSim(`SELECT pnc || '|' || model FROM "MachineListing" WHERE upper(regexp_replace(model, '[^A-Za-z0-9]', '', 'g')) = '${modelo.toUpperCase()}' ORDER BY pnc LIMIT 1 OFFSET ${indice}`);

await page.getByRole('button', { name: 'Tabela de preços', exact: true }).click();
await page.locator('main tbody tr td').first().waitFor({ timeout: 15000 });

/** Abre o diálogo de orçamento da máquina e devolve { dialogo, texto } depois de dar tempo ao site público de responder. */
async function abrir(modelo, antes, indice = 0) {
  const alvo = listado(modelo, indice);
  if (!alvo) return null;
  const [pnc, nome] = alvo.split('|');
  await fechar();
  if (antes) await antes();
  await page.getByLabel('Buscar máquina na tabela').fill(pnc);
  await page.locator('main tbody tr', { hasText: pnc }).locator('td').first().getByRole('button').click();
  const gaveta = page.getByRole('dialog');
  await gaveta.waitFor({ timeout: 8000 });
  await gaveta.getByRole('button', { name: 'Orçamento', exact: true }).click();
  const dialogo = page.getByRole('dialog', { name: new RegExp(`Orçamento da ${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`) });
  await dialogo.waitFor({ timeout: 5000 });
  await page.waitForTimeout(3500);
  return { dialogo, pnc, nome, texto: (await dialogo.innerText()).replace(/\s+/g, ' ') };
}
async function fechar() {
  for (let i = 0; i < 4 && await page.getByRole('dialog').count(); i++) { await page.keyboard.press('Escape'); await page.waitForTimeout(400); }
}

await step('Motosserra profissional (281XP): classe de uso e faixa de sabre, já marcadas', async () => {
  const r = await abrir('281XP');
  if (!r) return check('281XP está na lista da simulação', false);
  check('mostra "Uso profissional em tempo integral"', r.texto.includes('Uso profissional em tempo integral'), r.texto.slice(0, 300));
  check('mostra "Sabres compatíveis: 38 a 70 cm"', r.texto.includes('Sabres compatíveis: 38 a 70 cm'));
  check('as duas linhas vêm marcadas', await r.dialogo.getByRole('checkbox', { name: /Uso profissional em tempo integral/ }).isChecked() && await r.dialogo.getByRole('checkbox', { name: /Sabres compatíveis/ }).isChecked());
  check('as linhas da lista continuam lá (sabre/corrente)', /Sabre \d+/.test(r.texto) || /Corrente/.test(r.texto));
  check('não mostra o PNC', !r.texto.includes(r.pnc));
  await shot(page, `${theme}-1366-orcamento-maquina-uso-281xp`);

  // desmarcar uma linha tira da prévia; o PDF leva só o que está marcado
  await r.dialogo.getByRole('checkbox', { name: /Sabres compatíveis/ }).uncheck();
  const previa = (await r.dialogo.getByLabel('Prévia do texto do orçamento').innerText()).replace(/\s+/g, ' ');
  check('desmarcar tira a linha da prévia', previa.includes('Uso profissional em tempo integral') && !previa.includes('Sabres compatíveis'));
  await r.dialogo.getByLabel('Cliente (A/C)').fill('Fazenda Teste');
  const [download] = await Promise.all([page.waitForEvent('download', { timeout: 20000 }), r.dialogo.getByRole('button', { name: /Baixar orçamento em PDF/ }).click()]);
  const destino = path.join(OUT, 'orcamento-281XP-uso.pdf');
  await download.saveAs(destino);
  const bruto = fs.readFileSync(destino).toString('latin1').replace(/\\([()])/g, '$1');
  check('o PDF leva a classe de uso marcada', bruto.includes('Uso profissional em tempo integral'));
  check('o PDF não leva a linha desmarcada', !bruto.includes('Sabres compat'));
  check('o PDF não leva o PNC', !bruto.includes(r.pnc));
  await page.getByRole('dialog', { name: /Orçamento da/ }).waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined);
});

await step('Outras classes: ocasional (120), arborista (T435), soprador', async () => {
  for (const [modelo, esperado] of [['120', 'Uso ocasional'], ['T435', 'Uso em poda e cuidado de árvores (arborista)']]) {
    const r = await abrir(modelo);
    if (!r) { console.log(`   (${modelo} não está na lista da simulação)`); continue; }
    check(`${modelo}: "${esperado}"`, r.texto.includes(esperado), r.texto.slice(0, 200));
    await fechar();
  }
  const blower = sqlSim(`SELECT model FROM "MachineListing" WHERE category ILIKE 'SOPRADOR%' ORDER BY model`).split('\n').filter(Boolean);
  const achou = [];
  for (const modelo of blower.slice(0, 4)) {
    const r = await abrir(modelo.replace(/[^A-Za-z0-9]/g, ''));
    if (!r) continue;
    if (/Uso (residencial|profissional)/.test(r.texto)) achou.push(modelo);
    await fechar();
  }
  check('pelo menos um soprador mostra a classificação de uso', achou.length > 0, `${blower.slice(0, 4).join(', ')}`);
});

await step('Onde NÃO deve aparecer nada: roçadeira, máquina que o site não tem', async () => {
  for (const modelo of ['143RST', '226K', 'LC151']) {
    const r = await abrir(modelo);
    if (!r) { console.log(`   (${modelo} não está na lista da simulação)`); continue; }
    check(`${modelo}: sem classe de uso nem sabres`, !/Uso (profissional|ocasional|em tempo|residencial|em poda)|Sabres compatíveis/.test(r.texto), r.texto.slice(0, 200));
    check(`${modelo}: o orçamento continua completo (descrição 01-) e botão de PDF)`, /01-\)/.test(r.texto) && await r.dialogo.getByRole('button', { name: /Baixar orçamento em PDF/ }).isEnabled());
    await fechar();
  }
});

await step('Site fora do ar ou resposta torta: o orçamento abre igual, sem erro na tela', async () => {
  const errosAntes = errors.length;
  const rodadas = [['281XP', 1], ['281XP', 2], ['272XP', 1]];
  let rodada = 0;
  for (const [rotulo, tratar] of [
    ['servidor responde 500', route => route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"x"}' })],
    ['conexão cai', route => route.abort()],
    ['resposta torta', route => route.fulfill({ status: 200, contentType: 'application/json', body: '{"use":{"useClass":42,"barMinCm":"abc","barMaxCm":null}}' })],
  ]) {
    await page.route('**/api/machine-list/*/public-specs', tratar);
    let r;
    // cada rodada usa OUTRA versão da 281XP (outro PNC): o resultado de antes fica guardado na tela por uma hora
    try { r = await abrir(...[rodadas[rodada][0], undefined, rodadas[rodada++][1]]); } catch (erro) { await page.unroute('**/api/machine-list/*/public-specs'); throw erro; }
    check(`${rotulo}: o diálogo abre`, !!r);
    if (r) {
      check(`${rotulo}: sem linhas do site e sem mensagem de erro`, !/Uso profissional em tempo integral|Sabres compatíveis|erro|falha/i.test(r.texto), r.texto.slice(0, 200));
      check(`${rotulo}: continua dando para gerar o PDF`, await r.dialogo.getByRole('button', { name: /Baixar orçamento em PDF/ }).isEnabled());
    }
    await fechar();
    await page.unroute('**/api/machine-list/*/public-specs');
  }
  // o 500 e a conexão derrubada são a falha que EU injetei: esperados, não contam como erro do roteiro
  for (let i = errors.length - 1; i >= errosAntes; i--) if (/status of 500|ERR_FAILED/.test(String(errors[i]))) errors.splice(i, 1);
});

await step('O servidor: exige login e recusa PNC sem sentido', async () => {
  const anon = await fetch('http://127.0.0.1:3333/api/machine-list/965801490BR/public-specs');
  check('sem login responde 401', anon.status === 401, String(anon.status));
  const api = (p) => page.evaluate(async url => { const r = await fetch(url, { credentials: 'include' }); return { status: r.status, body: await r.json() }; }, p);
  const bom = await api('/api/machine-list/965801490BR/public-specs');
  check('PNC com BR: 200 e traz a classe de uso', bom.status === 200 && bom.body.use?.useClass === 'Uso profissional em tempo integral', JSON.stringify(bom.body).slice(0, 160));
  for (const lixo of ['abc', '123', '96580149000', '%27%3B%20DROP%20TABLE', '..%2F..%2Fetc']) {
    const r = await api(`/api/machine-list/${lixo}/public-specs`);
    check(`"${decodeURIComponent(lixo)}": 200 com use nulo, sem consultar o site`, r.status === 200 && r.body.use === null, `${r.status} ${JSON.stringify(r.body)}`);
  }
});

if (falhas.length) console.log('   respostas com erro:', [...new Set(falhas)].slice(0, 6));
// 404 do Portal em máquina que ele não conhece (125B, 226K...) já existia e não é desta mudança: só vale o que NÃO for isso.
if (falhas.length && falhas.every(item => item.startsWith('404 /api/husqvarna/products/') && item.endsWith('/details'))) { for (let i = errors.length - 1; i >= 0; i--) if (/status of 404/.test(String(errors[i]))) errors.splice(i, 1); }
await finish(browser, errors);
