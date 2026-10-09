import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { parsePriceListCatalog } from '../scripts/price-list-html';
import { parseServicePartRows } from '../scripts/service-parts';
import { PriceListApprovalError, applyPriceList, buildPriceListReport, fileProblem } from './price-list-update.service';

// Precisa de Postgres de verdade (transação, UPDATE ... FROM VALUES). Códigos e preços INVENTADOS; grava com tenant próprio e limpa no fim.
// Nunca rode contra o banco de produção (o `npm test` recusa).
const TENANT = '00000000-0000-0000-0000-0000000000f1';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000f2';

async function wipe() {
  await prisma.$executeRaw`DELETE FROM "CommercialImportRun" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "MasterPartSection" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "PriceListChange" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "MachineServicePart" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "MasterPart" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" IN (${TENANT}, ${OTHER_TENANT})`;
}

const row = (codigo: string, preco: string, extra: Record<string, string> = {}) => ({ codigo, descricao: `PEÇA ${codigo}`, preco, modelo: 'MODELO TESTE', ...extra });
const catalog = (pecas: unknown[]) => parsePriceListCatalog({ pecas, acessorios: [], lubrificantes: [], ferramentas: [] });
const source = { filename: 'teste.html', hash: 'a'.repeat(64) };

async function seed() {
  await wipe();
  await prisma.tenant.createMany({ data: [{ id: TENANT, name: 'Loja de teste' }, { id: OTHER_TENANT, name: 'Outra loja de teste' }] });
  // 92 / 0,92 = 100: este código JÁ está no preço certo. O outro está defasado. O terceiro só o banco tem.
  await prisma.masterPart.createMany({
    data: [
      { tenantId: TENANT, partNumber: 'ZQ100', normalizedNumber: 'ZQ100', name: 'igual', price: 100 },
      { tenantId: TENANT, partNumber: 'ZQ200', normalizedNumber: 'ZQ200', name: 'defasado', price: 50 },
      { tenantId: TENANT, partNumber: 'ZQ900', normalizedNumber: 'ZQ900', name: 'so no banco', price: 7 },
      { tenantId: OTHER_TENANT, partNumber: 'ZQ200', normalizedNumber: 'ZQ200', name: 'defasado da outra loja', price: 50 },
    ],
  });
}

test('relatório só LÊ: mostra o que muda, o que é novo e o que só o banco tem, e não grava nada', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([row('ZQ100', 'R$ 92,00'), row('ZQ200', 'R$ 138,00'), row('ZQ300', 'R$ 46,00')]);

  const report = await buildPriceListReport(prisma, TENANT, list);
  assert.equal(report.changed, 1, 'só o ZQ200 muda de preço');
  assert.equal(report.added, 1, 'o ZQ300 é novo');
  assert.equal(report.unchanged, 1, 'o ZQ100 já está certo');
  assert.equal(report.missingFromList, 1, 'o ZQ900 só o banco tem');
  assert.equal(report.topIncreases[0].partNumber, 'ZQ200');
  assert.equal(report.topIncreases[0].after, 150);
  assert.equal(await prisma.masterPart.count({ where: { tenantId: TENANT } }), 3, 'nada foi gravado');
});

test('gravação aprovada atualiza o preço, cria o código novo, não apaga nada e não toca em outra loja', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([row('ZQ100', 'R$ 92,00'), row('ZQ200', 'R$ 138,00'), row('ZQ300', 'R$ 46,00')]);

  const result = await applyPriceList(prisma, TENANT, list, { changed: 1, added: 1 }, source);
  assert.deepEqual([result.updated, result.added], [1, 1]);

  const mine = new Map((await prisma.masterPart.findMany({ where: { tenantId: TENANT } })).map(part => [part.normalizedNumber, part.price]));
  assert.equal(mine.get('ZQ200'), 150);
  assert.equal(mine.get('ZQ300'), 50);
  assert.equal(mine.get('ZQ900'), 7, 'o código que a lista não traz fica como estava');
  assert.equal((await prisma.masterPart.findFirst({ where: { tenantId: OTHER_TENANT, normalizedNumber: 'ZQ200' } }))?.price, 50, 'a outra loja não muda');
  assert.equal(await prisma.commercialImportRun.count({ where: { tenantId: TENANT } }), 1, 'a importação fica registrada');

  // Rodar de novo com a lista aprovada que agora não muda nada: nada a gravar, e nada quebra.
  const again = await applyPriceList(prisma, TENANT, list, { changed: 0, added: 0 }, source);
  assert.deepEqual([again.updated, again.added], [0, 0]);
});

test('se os números mudaram desde o relatório, recusa e NÃO grava nada', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([row('ZQ200', 'R$ 138,00'), row('ZQ300', 'R$ 46,00')]);

  for (const approved of [{ changed: 2, added: 1 }, { changed: 1, added: 0 }, { changed: 0, added: 0 }]) {
    await assert.rejects(() => applyPriceList(prisma, TENANT, list, approved, source), PriceListApprovalError, JSON.stringify(approved));
  }
  assert.equal((await prisma.masterPart.findFirst({ where: { tenantId: TENANT, normalizedNumber: 'ZQ200' } }))?.price, 50, 'o preço continua o antigo');
  assert.equal(await prisma.masterPart.count({ where: { tenantId: TENANT, normalizedNumber: 'ZQ300' } }), 0, 'o código novo não entrou');
  assert.equal(await prisma.commercialImportRun.count({ where: { tenantId: TENANT } }), 0);
});

test('preço alterado no banco depois do relatório derruba a gravação inteira (trava do "antes")', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([row('ZQ200', 'R$ 138,00'), row('ZQ300', 'R$ 46,00')]);
  const report = await buildPriceListReport(prisma, TENANT, list);
  assert.deepEqual([report.changed, report.added], [1, 1]);

  // Entre o relatório e a gravação alguém mexe no preço do ZQ200: a trava de "antes" reprova e a transação desfaz tudo (inclusive o código novo).
  const realFindMany = prisma.masterPart.findMany.bind(prisma.masterPart);
  let calls = 0;
  (prisma.masterPart as { findMany: unknown }).findMany = async (args: Parameters<typeof realFindMany>[0]) => {
    const rows = await realFindMany(args);
    calls += 1;
    if (calls === 1) await prisma.masterPart.updateMany({ where: { tenantId: TENANT, normalizedNumber: 'ZQ200' }, data: { price: 60 } });
    return rows;
  };
  try {
    await assert.rejects(() => applyPriceList(prisma, TENANT, list, { changed: 1, added: 1 }, source), /Nada foi gravado/);
  } finally {
    (prisma.masterPart as { findMany: unknown }).findMany = realFindMany;
  }
  assert.equal(await prisma.masterPart.count({ where: { tenantId: TENANT, normalizedNumber: 'ZQ300' } }), 0, 'o código novo foi desfeito junto');
});

// ── Peças de revisão (campo "reparo"), gravadas junto da lista ─────────────────────────────────────────────────────────────────────────
const revisao = (...rows: Array<[string, string, string]>) => parseServicePartRows(rows.map(([codigo, pnc, reparo]) => ({ codigo, pnc, reparo, descricao: `PEÇA ${codigo}` }))).links;

test('revisão: o relatório mostra o que entra e sai, e gravar troca a tabela inteira junto com a lista', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([row('ZQ100', 'R$ 92,00')]);
  await prisma.machineServicePart.createMany({ data: [
    { tenantId: TENANT, pnc: '967000001', partNumber: 'OLD1', normalizedNumber: 'OLD1', name: 'antiga', kind: 'PREVENTIVO' },
    { tenantId: OTHER_TENANT, pnc: '967000001', partNumber: 'OLD1', normalizedNumber: 'OLD1', name: 'da outra loja', kind: 'PREVENTIVO' },
  ] });
  const links = revisao(['ZQ1', '967000001', 'PREVENTIVO'], ['ZQ2', '967000001', 'CONSUMÍVEL'], ['ZQ3', '967000002', 'PREVENTIVO']);

  const report = await buildPriceListReport(prisma, TENANT, list, links);
  assert.deepEqual([report.service.added, report.service.removed, report.service.machines], [3, 1, 2]);
  assert.equal(report.changed, 0);
  assert.equal(await prisma.machineServicePart.count({ where: { tenantId: TENANT } }), 1, 'o relatório não grava');

  const result = await applyPriceList(prisma, TENANT, list, { changed: 0, added: 0, serviceAdded: 3, serviceRemoved: 1 }, source, links);
  assert.deepEqual([result.serviceAdded, result.serviceRemoved], [3, 1]);
  const mine = (await prisma.machineServicePart.findMany({ where: { tenantId: TENANT }, orderBy: { normalizedNumber: 'asc' } })).map(item => `${item.pnc}:${item.normalizedNumber}:${item.kind}`);
  assert.deepEqual(mine, ['967000001:ZQ1:PREVENTIVO', '967000001:ZQ2:CONSUMIVEL', '967000002:ZQ3:PREVENTIVO']);
  assert.equal(await prisma.machineServicePart.count({ where: { tenantId: OTHER_TENANT } }), 1, 'a outra loja não muda');
});

test('revisão: só a revisão mudou (preço igual) ainda grava; números fora do aprovado recusam sem gravar nada', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([row('ZQ100', 'R$ 92,00')]);
  const links = revisao(['ZQ1', '967000001', 'PREVENTIVO']);

  await assert.rejects(() => applyPriceList(prisma, TENANT, list, { changed: 0, added: 0, serviceAdded: 0, serviceRemoved: 0 }, source, links), PriceListApprovalError);
  await assert.rejects(() => applyPriceList(prisma, TENANT, list, { changed: 0, added: 0, serviceAdded: 2, serviceRemoved: 0 }, source, links), PriceListApprovalError);
  assert.equal(await prisma.machineServicePart.count({ where: { tenantId: TENANT } }), 0, 'nada gravado nas recusas');

  const result = await applyPriceList(prisma, TENANT, list, { changed: 0, added: 0, serviceAdded: 1, serviceRemoved: 0 }, source, links);
  assert.equal(result.serviceAdded, 1);
  assert.equal(await prisma.commercialImportRun.count({ where: { tenantId: TENANT } }), 1);
});

test('revisão: lista SEM o campo (nenhuma ligação) não apaga o que já existe', async t => {
  await seed();
  t.after(wipe);
  await prisma.machineServicePart.create({ data: { tenantId: TENANT, pnc: '967000001', partNumber: 'ZQ1', normalizedNumber: 'ZQ1', name: 'existente', kind: 'PREVENTIVO' } });
  const list = catalog([row('ZQ200', 'R$ 138,00')]);

  const report = await buildPriceListReport(prisma, TENANT, list, []);
  assert.deepEqual([report.service.added, report.service.removed], [0, 0]);
  await applyPriceList(prisma, TENANT, list, { changed: 1, added: 0 }, source, []);
  assert.equal(await prisma.machineServicePart.count({ where: { tenantId: TENANT } }), 1, 'a revisão continua como estava');
});

test('revisão: falha no meio desfaz tudo, inclusive a troca de preço', async t => {
  await seed();
  t.after(wipe);
  const list = catalog([row('ZQ200', 'R$ 138,00')]);
  // Ligação repetida (o leitor nunca devolve isso): a gravação da revisão viola a chave única DEPOIS de o preço já ter sido trocado na transação.
  const links = [...revisao(['ZQ1', '967000001', 'PREVENTIVO']), ...revisao(['ZQ1', '967000001', 'PREVENTIVO'])];
  await assert.rejects(() => applyPriceList(prisma, TENANT, list, { changed: 1, added: 0, serviceAdded: 1, serviceRemoved: 0 }, source, links));
  assert.equal((await prisma.masterPart.findFirst({ where: { tenantId: TENANT, normalizedNumber: 'ZQ200' } }))?.price, 50, 'o preço voltou ao antigo');
  assert.equal(await prisma.machineServicePart.count({ where: { tenantId: TENANT } }), 0);
  assert.equal(await prisma.commercialImportRun.count({ where: { tenantId: TENANT } }), 0);
});

// ── Arquivo suspeito não grava ─────────────────────────────────────────────────────────────────────────────────────────────────────────
test('fileProblem: arquivo vazio, sem código legível ou com mais de 5% de linhas ilegíveis é suspeito; até 5% passa', () => {
  const stats = (rows: number, bad: number, noCode: number, uniqueCodes = rows - bad - noCode) => ({ rows, rowsWithBadPrice: bad, rowsWithoutCode: noCode, uniqueCodes });
  assert.match(fileProblem(stats(0, 0, 0, 0)) ?? '', /nenhuma peça/);
  assert.match(fileProblem(stats(10, 10, 0, 0)) ?? '', /nenhuma peça/);
  assert.equal(fileProblem(stats(1000, 50, 0)), null, '5% exatos ainda passa');
  assert.equal(fileProblem(stats(1000, 25, 25)), null, 'bad + sem código somam 5%: passa');
  assert.match(fileProblem(stats(1000, 51, 0)) ?? '', /Mais de 5% das linhas/);
  assert.match(fileProblem(stats(1000, 0, 60)) ?? '', /Mais de 5% das linhas/);
  assert.equal(fileProblem(stats(22289, 0, 0)), null, 'a lista real não tem linha ilegível');
});

test('arquivo suspeito: o relatório diz o motivo e a gravação RECUSA, mesmo com os números certos, sem gravar nada', async t => {
  await seed();
  t.after(wipe);
  // 4 linhas boas e 2 com preço fora do padrão (33%): estragado.
  const bad = parsePriceListCatalog({
    pecas: [row('ZQ100', 'R$ 92,00'), row('ZQ200', 'R$ 138,00'), row('ZQ300', 'R$ 46,00'), row('ZQ400', 'R$ 10,00'), row('ZQ500', 'abc'), row('ZQ600', 'R$ 0,00')],
    acessorios: [], lubrificantes: [], ferramentas: [],
  });
  assert.equal(bad.stats.rowsWithBadPrice, 2, 'R$ 0,00 conta como preço fora do padrão');
  const report = await buildPriceListReport(prisma, TENANT, bad);
  assert.match(report.problem ?? '', /Mais de 5% das linhas/);
  await assert.rejects(() => applyPriceList(prisma, TENANT, bad, { changed: report.changed, added: report.added }, source), PriceListApprovalError);
  assert.equal(await prisma.masterPart.count({ where: { tenantId: TENANT, normalizedNumber: 'ZQ300' } }), 0, 'nada entrou');
  assert.equal((await prisma.masterPart.findFirst({ where: { tenantId: TENANT, normalizedNumber: 'ZQ200' } }))?.price, 50, 'nada mudou');

  const good = catalog([row('ZQ100', 'R$ 92,00'), row('ZQ200', 'R$ 138,00')]);
  assert.equal((await buildPriceListReport(prisma, TENANT, good)).problem, null, 'arquivo bom não tem problema');
});

// ── Escala: o que passa dos lotes de 400 (preços e códigos novos) e de 1.000 (histórico e revisão) ────────────────────────────────────
test('escala: 1.250 preços mudando e 1.250 códigos novos atravessam os lotes sem perder nenhum', async t => {
  await seed();
  t.after(wipe);
  const N = 1250;
  await prisma.masterPart.createMany({ data: Array.from({ length: N }, (_, i) => ({ tenantId: TENANT, partNumber: `ZE${i}`, normalizedNumber: `ZE${i}`, name: `existente ${i}`, price: 100 })) });
  // Os existentes sobem 8% (R$ 99,36 ÷ 0,92 = 108) e aparecem mais 1.250 códigos (R$ 46,00 ÷ 0,92 = 50). O ZQ100 e o ZQ200 já estão certos.
  const list = catalog([
    ...Array.from({ length: N }, (_, i) => row(`ZE${i}`, 'R$ 99,36')),
    ...Array.from({ length: N }, (_, i) => row(`ZN${i}`, 'R$ 46,00')),
    row('ZQ100', 'R$ 92,00'), row('ZQ200', 'R$ 46,00'),
  ]);
  const report = await buildPriceListReport(prisma, TENANT, list);
  assert.deepEqual([report.changed, report.added, report.unchanged], [N, N, 2]);

  const result = await applyPriceList(prisma, TENANT, list, { changed: N, added: N }, source);
  assert.deepEqual([result.updated, result.added], [N, N]);
  const precos = await prisma.masterPart.groupBy({ by: ['price'], where: { tenantId: TENANT, normalizedNumber: { startsWith: 'ZE' } }, _count: true });
  assert.deepEqual(precos.map(item => [item.price, item._count]), [[108, N]], 'todos os 1.250 existentes foram para 108');
  assert.equal(await prisma.masterPart.count({ where: { tenantId: TENANT, normalizedNumber: { startsWith: 'ZN' } } }), N, 'todos os novos entraram');
  assert.equal(await prisma.masterPartSection.count({ where: { tenantId: TENANT, normalizedNumber: { startsWith: 'ZN' } } }), N, 'e cada um com a sua seção');
  assert.equal(await prisma.priceListChange.count({ where: { tenantId: TENANT } }), N * 2, 'o histórico guarda os 2.500 para desfazer');
});

test('escala: 2.500 peças de revisão atravessam os lotes de 1.000 e a tabela fica exatamente igual à lista', async t => {
  await seed();
  t.after(wipe);
  const links = parseServicePartRows(Array.from({ length: 2500 }, (_, i) => ({ codigo: `ZR${i}`, pnc: `9670${String(i % 50).padStart(5, '0')}`, reparo: i % 3 === 0 ? 'PREVENTIVO' : 'CONSUMÍVEL', descricao: `PEÇA ${i}` }))).links;
  assert.equal(links.length, 2500);
  const list = catalog([row('ZQ100', 'R$ 92,00')]);
  const report = await buildPriceListReport(prisma, TENANT, list, links);
  assert.deepEqual([report.service.added, report.service.removed, report.service.machines], [2500, 0, 50]);
  await applyPriceList(prisma, TENANT, list, { changed: 0, added: 0, serviceAdded: 2500, serviceRemoved: 0 }, source, links);
  assert.equal(await prisma.machineServicePart.count({ where: { tenantId: TENANT } }), 2500);
  assert.equal((await buildPriceListReport(prisma, TENANT, list, links)).service.added, 0, 'rodar de novo não acha mais diferença');
});
