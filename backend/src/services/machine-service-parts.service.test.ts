import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { MachineServicePartsService, servicePncKey } from './machine-service-parts.service';

const TENANT = '00000000-0000-0000-0000-0000000000f3';
const OTHER_TENANT = '00000000-0000-0000-0000-0000000000f4';

async function wipe() {
  await prisma.$executeRaw`DELETE FROM "MachineServicePart" WHERE "tenantId" IN (${TENANT}, ${OTHER_TENANT})`;
  await prisma.$executeRaw`DELETE FROM "Tenant" WHERE "id" IN (${TENANT}, ${OTHER_TENANT})`;
}

test('o PNC é lido como o balcão escreve: máscara, 11 dígitos, sufixo BR; curto ou vazio não consulta', () => {
  assert.equal(servicePncKey('967 33 29-01'), '967332901');
  assert.equal(servicePncKey('96733290100'), '967332901');
  assert.equal(servicePncKey('970743401BR'), '970743401');
  for (const bad of ['', '12345', 'abc', null, undefined, '1234567890123']) assert.equal(servicePncKey(bad), null, String(bad));
});

// Precisa de Postgres de verdade. Nunca rode contra o banco de produção (o `npm test` recusa).
test('devolve só as peças da máquina e da loja, preventivas primeiro', async t => {
  await wipe();
  t.after(wipe);
  await prisma.tenant.createMany({ data: [{ id: TENANT, name: 'Loja de teste' }, { id: OTHER_TENANT, name: 'Outra loja de teste' }] });
  const link = (tenantId: string, pnc: string, code: string, name: string, kind: string) => ({ tenantId, pnc, partNumber: code, normalizedNumber: code, name, kind });
  await prisma.machineServicePart.createMany({ data: [
    link(TENANT, '967000001', 'ZQ3', 'VELA', 'CONSUMIVEL'),
    link(TENANT, '967000001', 'ZQ2', 'FILTRO DE AR', 'PREVENTIVO'),
    link(TENANT, '967000001', 'ZQ1', 'ABRAÇADEIRA', 'PREVENTIVO'),
    link(TENANT, '967000001', 'ZQ4', 'ROLAMENTO', 'PREDITIVO'),
    link(TENANT, '967000002', 'ZQ9', 'DE OUTRA MÁQUINA', 'PREVENTIVO'),
    link(OTHER_TENANT, '967000001', 'ZQ8', 'DE OUTRA LOJA', 'PREVENTIVO'),
  ] });

  const parts = await MachineServicePartsService.forPnc(TENANT, '967 00 00-01');
  assert.deepEqual(parts.map(part => part.partNumber), ['ZQ1', 'ZQ2', 'ZQ3', 'ZQ4'], 'preventivas (por nome), depois consumível, depois preditiva');
  assert.deepEqual(await MachineServicePartsService.forPnc(TENANT, '999999999'), []);
  assert.deepEqual(await MachineServicePartsService.forPnc(TENANT, ''), []);
});
