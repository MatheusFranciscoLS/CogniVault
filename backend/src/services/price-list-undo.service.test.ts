import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { parsePriceListCatalog } from '../scripts/price-list-html';
import { applyPriceList } from './price-list-update.service';
import { PRICE_LIST_HISTORY_RUNS, PriceListUndoError, previewUndo, undoLastPriceListUpdate } from './price-list-undo.service';

// Precisa de Postgres de verdade (transações, UPDATE ... FROM VALUES). Códigos e preços INVENTADOS; tenants próprios; limpa no fim.
// Nunca rode contra o banco de produção (o `npm test` recusa).
const TENANT = '00000000-0000-0000-0000-0000000000d1';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000d2';

async function wipe() {
  await prisma.$executeRaw`DELETE FROM "PriceListChange" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "CommercialImportRun" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "MasterPartSection" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "MasterPart" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" IN (${TENANT}, ${OTHER_TENANT})`;
}

const row = (codigo: string, preco: string) => ({ codigo, descricao: `PEÇA ${codigo}`, preco, modelo: 'MODELO TESTE' });
const catalog = (pecas: unknown[]) => parsePriceListCatalog({ pecas, acessorios: [], lubrificantes: [], ferramentas: [] });
const price = async (tenantId: string, code: string) => (await prisma.masterPart.findFirst({ where: { tenantId, normalizedNumber: code } }))?.price;

/** ZQ100 (R$ 100) e ZQ200 (R$ 50) já existem; ZQ900 só existe na loja. */
async function seed() {
  await wipe();
  await prisma.tenant.createMany({ data: [{ id: TENANT, name: 'Loja de teste' }, { id: OTHER_TENANT, name: 'Outra loja de teste' }] });
  await prisma.masterPart.createMany({
    data: [
      { tenantId: TENANT, partNumber: 'ZQ100', normalizedNumber: 'ZQ100', name: 'a', price: 100 },
      { tenantId: TENANT, partNumber: 'ZQ200', normalizedNumber: 'ZQ200', name: 'b', price: 50 },
      { tenantId: TENANT, partNumber: 'ZQ900', normalizedNumber: 'ZQ900', name: 'c', price: 7 },
      { tenantId: OTHER_TENANT, partNumber: 'ZQ200', normalizedNumber: 'ZQ200', name: 'da outra loja', price: 50 },
    ],
  });
}

/** ZQ200 passa de 50 para 150, ZQ300 é novo (R$ 46 ÷ 0,92 = R$ 50), ZQ100 fica igual. */
async function runUpdate(filename = 'lista.html', tenantId = TENANT) {
  const list = catalog([row('ZQ100', 'R$ 92,00'), row('ZQ200', 'R$ 138,00'), row('ZQ300', 'R$ 46,00')]);
  return applyPriceList(prisma, tenantId, list, { changed: 1, added: 1 }, { filename, hash: 'a'.repeat(64) });
}

test('desfazer devolve o preço de antes, remove o código criado e só vale uma vez', async t => {
  await seed();
  t.after(wipe);
  assert.equal(await previewUndo(prisma, TENANT), null, 'sem atualização, nada a desfazer');
  await runUpdate('lista-1.html');
  assert.equal(await price(TENANT, 'ZQ200'), 150);
  assert.equal(await price(TENANT, 'ZQ300'), 50);

  const preview = await previewUndo(prisma, TENANT);
  assert.ok(preview);
  assert.deepEqual([preview.filename, preview.prices, preview.added, preview.skipped], ['lista-1.html', 1, 1, 0]);

  const result = await undoLastPriceListUpdate(prisma, TENANT, { runId: preview.runId, prices: 1, added: 1 });
  assert.deepEqual([result.prices, result.added, result.skipped], [1, 1, 0]);
  assert.equal(await price(TENANT, 'ZQ200'), 50, 'o preço voltou');
  assert.equal(await price(TENANT, 'ZQ300'), undefined, 'o código criado saiu');
  assert.equal(await price(TENANT, 'ZQ100'), 100, 'o que a atualização não tocou fica como estava');
  assert.equal(await price(TENANT, 'ZQ900'), 7, 'o código que só a loja tem fica como estava');
  assert.equal(await prisma.masterPartSection.count({ where: { tenantId: TENANT, normalizedNumber: 'ZQ300' } }), 0, 'e a seção dele também');

  assert.equal(await previewUndo(prisma, TENANT), null, 'uma atualização só se desfaz uma vez');
  await assert.rejects(() => undoLastPriceListUpdate(prisma, TENANT, { runId: preview.runId, prices: 1, added: 1 }), PriceListUndoError);
  assert.equal(await price(TENANT, 'ZQ200'), 50);
});

test('preço ajustado DEPOIS da atualização não é desfeito por cima (nem o código criado que já mudou)', async t => {
  await seed();
  t.after(wipe);
  await runUpdate();
  await prisma.masterPart.updateMany({ where: { tenantId: TENANT, normalizedNumber: 'ZQ200' }, data: { price: 175 } });

  const preview = await previewUndo(prisma, TENANT);
  assert.deepEqual([preview?.prices, preview?.added, preview?.skipped], [0, 1, 1], 'o ajuste manual fica de fora e é contado');
  await undoLastPriceListUpdate(prisma, TENANT, { runId: preview!.runId, prices: 0, added: 1 });
  assert.equal(await price(TENANT, 'ZQ200'), 175, 'o ajuste manual continua');
  assert.equal(await price(TENANT, 'ZQ300'), undefined);

  await seed();
  await runUpdate();
  await prisma.masterPart.updateMany({ where: { tenantId: TENANT, normalizedNumber: 'ZQ300' }, data: { price: 80 } });
  const second = await previewUndo(prisma, TENANT);
  assert.deepEqual([second?.prices, second?.added, second?.skipped], [1, 0, 1], 'código criado e já reajustado não é apagado');
});

test('números diferentes dos que o administrador viu recusam e não desfazem nada', async t => {
  await seed();
  t.after(wipe);
  await runUpdate();
  const preview = (await previewUndo(prisma, TENANT))!;

  for (const approved of [{ prices: 2, added: 1 }, { prices: 1, added: 0 }, { prices: 0, added: 0 }]) {
    await assert.rejects(() => undoLastPriceListUpdate(prisma, TENANT, { runId: preview.runId, ...approved }), PriceListUndoError, JSON.stringify(approved));
  }
  await assert.rejects(() => undoLastPriceListUpdate(prisma, TENANT, { runId: '00000000-0000-0000-0000-000000000000', prices: 1, added: 1 }), PriceListUndoError, 'outra atualização');
  assert.equal(await price(TENANT, 'ZQ200'), 150, 'nada foi desfeito');
  assert.equal(await price(TENANT, 'ZQ300'), 50);
});

test('só a atualização mais recente aparece; outra loja não enxerga nem mexe', async t => {
  await seed();
  t.after(wipe);
  await runUpdate('lista-1.html');
  await prisma.masterPart.updateMany({ where: { tenantId: TENANT, normalizedNumber: 'ZQ200' }, data: { price: 150 } });
  const list2 = catalog([row('ZQ100', 'R$ 92,00'), row('ZQ200', 'R$ 184,00'), row('ZQ300', 'R$ 46,00')]);
  await applyPriceList(prisma, TENANT, list2, { changed: 1, added: 0 }, { filename: 'lista-2.html', hash: 'b'.repeat(64) });
  assert.equal(await price(TENANT, 'ZQ200'), 200);

  const preview = (await previewUndo(prisma, TENANT))!;
  assert.equal(preview.filename, 'lista-2.html');
  assert.equal(await previewUndo(prisma, OTHER_TENANT), null, 'a outra loja não tem atualização');
  await assert.rejects(() => undoLastPriceListUpdate(prisma, OTHER_TENANT, { runId: preview.runId, prices: 1, added: 0 }), PriceListUndoError);

  await undoLastPriceListUpdate(prisma, TENANT, { runId: preview.runId, prices: 1, added: 0 });
  assert.equal(await price(TENANT, 'ZQ200'), 150, 'voltou ao preço da lista 1, não ao original');
  assert.equal(await price(TENANT, 'ZQ300'), 50, 'o código criado pela lista 1 continua');
  assert.equal(await price(OTHER_TENANT, 'ZQ200'), 50, 'a outra loja não mudou');
});

test('o histórico guarda só as últimas atualizações', async t => {
  await seed();
  t.after(wipe);
  for (let n = 1; n <= PRICE_LIST_HISTORY_RUNS + 2; n += 1) {
    // Cada atualização muda o preço do ZQ200 para um valor novo.
    const list = catalog([row('ZQ200', `R$ ${(100 + n).toFixed(2).replace('.', ',')}`)]);
    const stored = (await prisma.masterPart.findFirst({ where: { tenantId: TENANT, normalizedNumber: 'ZQ200' } }))!.price!;
    const diffTarget = Math.round(((100 + n) / 0.92) * 100) / 100;
    if (Math.abs(stored - diffTarget) < 0.005) continue;
    await applyPriceList(prisma, TENANT, list, { changed: 1, added: 0 }, { filename: `lista-${n}.html`, hash: String(n).repeat(64).slice(0, 64) });
  }
  const runs = await prisma.priceListChange.groupBy({ by: ['runId'], where: { tenantId: TENANT } });
  assert.equal(runs.length, PRICE_LIST_HISTORY_RUNS);
  const names = (await prisma.priceListChange.findMany({ where: { tenantId: TENANT }, select: { filename: true } })).map(item => item.filename);
  assert.ok(!names.includes('lista-1.html') && names.includes(`lista-${PRICE_LIST_HISTORY_RUNS + 2}.html`), 'as mais antigas saíram e a mais nova ficou');
});
