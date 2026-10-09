import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import { prisma } from '../config/prisma';
import { QuoteService } from './quote.service';
import { RepairImportApprovalError, applyRepairImport, previewRepairImport, type RepairImportFile } from './repair-import.service';

// Precisa de Postgres de verdade (o `npm test` recusa a produção). Planilhas SINTÉTICAS: o repositório é público.
const TENANT = '00000000-0000-0000-0000-0000000000f8';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000f9';
const USER = '00000000-0000-0000-0000-0000000000fa';

async function wipe() {
  await prisma.$executeRaw`DELETE FROM "Quote" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "User" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" IN (${TENANT}, ${OTHER_TENANT})`;
}

function sheet(name: string, rows: unknown[][], modifiedAt = Date.UTC(2022, 5, 15)): RepairImportFile {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(rows), 'BASE ORÇAMENTO');
  const bytes = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
  return { name, modifiedAt, data: bytes.toString('base64') };
}
const HEADER = ['CÓDIGO', 'DESCRIÇÃO', 'QTDE', 'VALOR UNIT', 'VALOR TOTAL', 'PRAZO'];
const dav = (numero: number, valor = 20, modifiedAt?: number) => sheet(`ORÇAMENTO DAV ${numero}.xlsx`, [['LOC', ...HEADER], ['P14-C2', 'VI1', 'JOGO DE JUNTAS', 1, valor, valor, '7 DIAS'], [null, null, 'MÃO DE OBRA', 1, 150, 150, 'IMEDIATO']], modifiedAt);

test('o relatório diz o que cada arquivo vira e NÃO grava nada', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.create({ data: { id: TENANT, name: 'Loja de teste' } });
  const lote = [dav(59600), dav(59601), { ...dav(59601), name: 'ORÇAMENTO DAV 59601 (1).xlsx' }, sheet('~$ORÇAMENTO DAV 59602.xlsx', [HEADER]), sheet('AGRALE.xlsx', [HEADER]), sheet('ORÇAMENTO DAV 59603.xlsx', [['só texto']])];
  const relatorio = await previewRepairImport(TENANT, lote);
  assert.deepEqual(relatorio.entries.map(entry => entry.status), ['OK', 'OK', 'EXISTS', 'SKIPPED', 'SKIPPED', 'PROBLEM']);
  assert.equal(relatorio.ok, 2);
  assert.equal(relatorio.exists, 1, 'a OS repetida dentro do lote vale a primeira');
  assert.equal(relatorio.skipped, 2);
  assert.equal(relatorio.problems, 1);
  assert.equal(relatorio.entries[0].items, 2);
  assert.equal(relatorio.entries[0].total, 170);
  assert.equal(await prisma.quote.count({ where: { tenantId: TENANT } }), 0, 'só leu');
});

test('grava só o aprovado, com a data do arquivo, sem cliente e sem atendente, e a OS que já existe NÃO é sobrescrita', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.create({ data: { id: TENANT, name: 'Loja de teste' } });
  await prisma.user.create({ data: { id: USER, tenantId: TENANT, email: 'balcao@teste.local', password: 'x', role: 'MECHANIC' } });

  const quando = Date.UTC(2021, 2, 10, 15, 0, 0);
  const lote = [dav(59600, 20, quando), dav(59601, 30)];

  // Números diferentes dos que foram aprovados: recusa e não grava nada.
  await assert.rejects(() => applyRepairImport(TENANT, lote, 3), RepairImportApprovalError);
  assert.equal(await prisma.quote.count({ where: { tenantId: TENANT } }), 0);

  const resultado = await applyRepairImport(TENANT, lote, 2);
  assert.equal(resultado.created, 2);
  const guardado = await prisma.quote.findFirstOrThrow({ where: { tenantId: TENANT, docNumber: '59600' }, include: { items: { orderBy: { sortOrder: 'asc' } } } });
  assert.equal(guardado.kind, 'REPAIR');
  assert.equal(guardado.status, 'SAVED');
  assert.equal(guardado.userId, null, 'sem atendente');
  assert.equal(guardado.customerName, null, 'sem cliente (a planilha não tem)');
  assert.equal(guardado.savedAt?.getTime(), quando, 'a data é a do arquivo');
  assert.equal(guardado.netTotal, 170);
  assert.deepEqual(guardado.items.map(item => [item.name, item.leadTime, item.isService, item.location]), [['JOGO DE JUNTAS', '7 dias', false, 'P14-C2'], ['MÃO DE OBRA', 'Pronta entrega', true, null]]);

  // Rodar de novo: a OS já existe, nada é sobrescrito nem duplicado.
  const denovo = await applyRepairImport(TENANT, [dav(59600, 999), dav(59601, 999)], 0);
  assert.equal(denovo.created, 0);
  assert.equal(denovo.exists, 2);
  const depois = await prisma.quote.findMany({ where: { tenantId: TENANT, docNumber: { in: ['59600', '59601'] } } });
  assert.equal(depois.length, 2);
  assert.ok(depois.every(quote => quote.netTotal !== 1149), 'o valor antigo foi preservado');
});

test('a pasta de conserto é da loja: o balcão enxerga os importados; orçamento de peças continua só do atendente; outra loja não vê', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.createMany({ data: [{ id: TENANT, name: 'Loja de teste' }, { id: OTHER_TENANT, name: 'Outra loja' }] });
  await prisma.user.create({ data: { id: USER, tenantId: TENANT, email: 'balcao@teste.local', password: 'x', role: 'MECHANIC' } });
  await applyRepairImport(TENANT, [dav(59600)], 1);
  await applyRepairImport(OTHER_TENANT, [dav(59600)], 1);
  await QuoteService.saveQuote(TENANT, USER, [{ partNumber: 'X1', name: 'PEÇA', quantity: 1, unitPrice: 10 }], { kind: 'PARTS' });

  const base = { tenantId: TENANT, take: 25, skip: 0, restrictToUserId: USER };
  const conserto = await QuoteService.listSavedQuotes({ ...base, kind: 'REPAIR' });
  assert.deepEqual(conserto.quotes.map(quote => quote.docNumber), ['59600'], 'o balcão vê o importado e só o da própria loja');
  assert.equal(conserto.quotes[0].attendantId, null);
  const pecas = await QuoteService.listSavedQuotes({ ...base, kind: 'PARTS' });
  assert.equal(pecas.total, 1);
  const semTipo = await QuoteService.listSavedQuotes({ ...base });
  assert.equal(semTipo.total, 1, 'sem filtro de tipo o balcão continua vendo só o que ele atendeu');
});
