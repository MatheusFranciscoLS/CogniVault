import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { EnginePartsWithoutPriceService } from './engine-parts-without-price.service';

// Precisa de Postgres de verdade (SQL com NOT EXISTS entre duas tabelas). Grava com identificadores próprios e limpa no fim, como os outros
// testes com banco; nunca rode contra o banco de produção (o `npm test` recusa).
const TENANT = '00000000-0000-0000-0000-0000000000e1';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000e2';
const ENGINE_A = 'TESTE-MOTOR-A';
const ENGINE_B = 'TESTE-MOTOR-B';

async function clear() {
  await prisma.$executeRaw`DELETE FROM "OfficialPartIndex" WHERE "engineModel" IN (${ENGINE_A}, ${ENGINE_B})`;
  await prisma.$executeRaw`DELETE FROM "MasterPart" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" IN (${TENANT}, ${OTHER_TENANT})`;
}

const index = (source: string, engineModel: string, partNumber: string, normalizedNumber: string, name: string) => prisma.officialPartIndex.create({
  data: { source, engineModel, normalizedEngine: engineModel.replace(/[^A-Z0-9]/g, ''), position: '', partNumber, normalizedNumber, name, normalizedName: name.toLowerCase() },
});

test('peças de motor lidas sem preço: sem cadastro, com preço zero ou de outra loja entram; com preço da loja saem', async t => {
  await clear();
  t.after(clear);
  await prisma.tenant.createMany({ data: [{ id: TENANT, name: 'Loja de teste' }, { id: OTHER_TENANT, name: 'Outra loja de teste' }] });

  // Quatro peças lidas; a ZZ3 serve a dois motores, de duas marcas.
  await index('KOHLER', ENGINE_A, 'ZZ1 11-S', 'ZZ111S', 'PEÇA COM PREÇO');
  await index('KOHLER', ENGINE_A, 'ZZ2 22-S', 'ZZ222S', 'PEÇA SEM CADASTRO');
  await index('KOHLER', ENGINE_A, 'ZZ3 33-S', 'ZZ333S', 'PEÇA EM DOIS MOTORES');
  await index('BRIGGS', ENGINE_B, 'ZZ3 33-S', 'ZZ333S', 'PEÇA EM DOIS MOTORES');
  await index('KOHLER', ENGINE_A, 'ZZ4 44-S', 'ZZ444S', 'PEÇA COM PREÇO ZERO');
  await index('KOHLER', ENGINE_A, 'ZZ5 55-S', 'ZZ555S', 'PEÇA COM PREÇO SÓ NA OUTRA LOJA');

  const master = (tenantId: string, normalizedNumber: string, price: number | null) => prisma.masterPart.create({
    data: { tenantId, partNumber: normalizedNumber, normalizedNumber, name: 'cadastro', price },
  });
  await master(TENANT, 'ZZ111S', 12.5);
  await master(TENANT, 'ZZ444S', 0);
  await master(OTHER_TENANT, 'ZZ555S', 99);

  const result = await EnginePartsWithoutPriceService.list(TENANT, 200);
  const mine = result.items.filter(item => /^ZZ\d/.test(item.partNumber));
  const numbers = mine.map(item => item.partNumber).sort();

  assert.deepEqual(numbers, ['ZZ2 22-S', 'ZZ3 33-S', 'ZZ4 44-S', 'ZZ5 55-S'], 'sem cadastro, preço zero e preço só de outra loja ficam; preço da loja sai');
  const two = mine.find(item => item.partNumber === 'ZZ3 33-S')!;
  assert.equal(two.engines, 2, 'a peça lida em dois motores conta os dois');
  assert.deepEqual([...two.sources].sort(), ['BRIGGS', 'KOHLER']);
  assert.equal(mine[0].partNumber, 'ZZ3 33-S', 'a peça que serve a mais motores vem primeiro');
  assert.ok(result.total >= 4);

  // Outra loja enxerga a própria lista de preços: para ela a ZZ5 tem preço e a ZZ1 não.
  const other = (await EnginePartsWithoutPriceService.list(OTHER_TENANT, 200)).items.map(item => item.partNumber);
  assert.ok(!other.includes('ZZ5 55-S'));
  assert.ok(other.includes('ZZ1 11-S'));
});

test('o limite protege a resposta: nunca devolve mais que 200 e aceita valor estranho', async () => {
  for (const limit of [0, -5, Number.NaN, 99999]) {
    const { items } = await EnginePartsWithoutPriceService.list(TENANT, limit);
    assert.ok(items.length <= 200, String(limit));
  }
});
