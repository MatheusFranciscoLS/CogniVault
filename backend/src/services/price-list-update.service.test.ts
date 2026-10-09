import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { parsePriceListCatalog } from '../scripts/price-list-html';
import { PriceListApprovalError, applyPriceList, buildPriceListReport } from './price-list-update.service';

// Precisa de Postgres de verdade (transação, UPDATE ... FROM VALUES). Códigos e preços INVENTADOS; grava com tenant próprio e limpa no fim.
// Nunca rode contra o banco de produção (o `npm test` recusa).
const TENANT = '00000000-0000-0000-0000-0000000000f1';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000f2';

async function wipe() {
  await prisma.$executeRaw`DELETE FROM "CommercialImportRun" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "MasterPartSection" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
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
