import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { SearchMissService, normalizeMissQuery, recordableMissQuery } from './search-miss.service';

const TENANT = '00000000-0000-0000-0000-0000000000a1';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000a2';

test('normaliza: minúsculo, sem acento, espaços juntados', () => {
  assert.equal(normalizeMissQuery('  Carburador   143RII '), 'carburador 143rii');
  assert.equal(normalizeMissQuery('Vela de IGNIÇÃO'), 'vela de ignicao');
  assert.equal(normalizeMissQuery('Óleo 2T'), 'oleo 2t');
});

test('só vale guardar texto de busca: curto, longo, e-mail, link, número comprido e não-texto ficam de fora', () => {
  assert.equal(recordableMissQuery('  carburador   143rii '), 'carburador 143rii');
  assert.equal(recordableMissQuery('587106701'), '587106701');
  assert.equal(recordableMissQuery('96041044000'), '96041044000', 'PNC de 11 dígitos é código, não telefone');
  for (const bad of ['a', ' ', '', 'x'.repeat(81), 'joao@email.com', 'https://site.com/x', 'www.site.com', '1234567890123456', 42, null, undefined, {}, []]) {
    assert.equal(recordableMissQuery(bad), null, String(bad).slice(0, 30));
  }
});

async function wipe() {
  await prisma.$executeRaw`DELETE FROM "SearchMiss" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" IN (${TENANT}, ${OTHER_TENANT})`;
}

// Precisa de Postgres de verdade (upsert com incremento). Nunca rode contra o banco de produção (o `npm test` recusa).
test('registrar soma a repetição, junta variações do mesmo texto e separa lojas', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.createMany({ data: [{ id: TENANT, name: 'Loja de teste' }, { id: OTHER_TENANT, name: 'Outra loja de teste' }] });

  assert.equal(await SearchMissService.record(TENANT, 'Vela de Ignição Z1'), true);
  assert.equal(await SearchMissService.record(TENANT, 'vela  de ignicao z1'), true);
  assert.equal(await SearchMissService.record(TENANT, 'vela de ignicao z1'), true);
  assert.equal(await SearchMissService.record(TENANT, 'peça rara 9'), true);
  assert.equal(await SearchMissService.record(OTHER_TENANT, 'vela de ignicao z1'), true);
  assert.equal(await SearchMissService.record(TENANT, 'joao@x.com'), false, 'dado pessoal não entra');

  const mine = await SearchMissService.top(TENANT, 30, 50);
  assert.equal(mine.total, 2);
  assert.deepEqual(mine.items.map(item => [item.query, item.count]), [['Vela de Ignição Z1', 3], ['peça rara 9', 1]], 'a mais repetida vem primeiro e guarda o texto da 1ª vez');
  assert.equal((await SearchMissService.top(OTHER_TENANT, 30, 50)).items[0].count, 1, 'a outra loja conta a parte');
});

test('dispensar tira só da própria loja', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.createMany({ data: [{ id: TENANT, name: 'Loja de teste' }, { id: OTHER_TENANT, name: 'Outra loja de teste' }] });
  await SearchMissService.record(TENANT, 'item para dispensar');
  const [item] = (await SearchMissService.top(TENANT, 30, 10)).items;

  assert.equal(await SearchMissService.dismiss(OTHER_TENANT, item.id), false, 'outra loja não mexe');
  assert.equal(await SearchMissService.dismiss(TENANT, item.id), true);
  assert.equal((await SearchMissService.top(TENANT, 30, 10)).total, 0);
});

test('o período filtra pela última vez que a busca apareceu', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.create({ data: { id: TENANT, name: 'Loja de teste' } });
  await SearchMissService.record(TENANT, 'busca antiga');
  await SearchMissService.record(TENANT, 'busca recente');
  await prisma.searchMiss.updateMany({ where: { tenantId: TENANT, normalizedQuery: 'busca antiga' }, data: { lastSeenAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000) } });

  assert.deepEqual((await SearchMissService.top(TENANT, 30, 10)).items.map(item => item.query), ['busca recente']);
  assert.equal((await SearchMissService.top(TENANT, 90, 10)).total, 2);
});

test('banco fora não derruba o atendimento: registrar devolve falso em vez de lançar', async () => {
  const real = prisma.searchMiss.findUnique.bind(prisma.searchMiss);
  let called = false;
  (prisma.searchMiss as { findUnique: unknown }).findUnique = async () => { called = true; throw new Error('banco fora'); };
  const original = console.error;
  console.error = () => {};
  try {
    assert.equal(await SearchMissService.record(TENANT, 'qualquer busca'), false);
  } finally {
    console.error = original;
    (prisma.searchMiss as { findUnique: unknown }).findUnique = real;
  }
  assert.equal(called, true, 'o catch foi exercitado');
});
