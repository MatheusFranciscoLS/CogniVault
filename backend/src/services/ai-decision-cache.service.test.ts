import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { AiDecisionCacheService } from './ai-decision-cache.service';

const tenantId = '00000000-0000-0000-0000-000000000111';

async function clearTestCache() {
  await prisma.$executeRaw`DELETE FROM "AiDecisionCache" WHERE "tenantId" = ${tenantId}`;
}

test('cache persistente reutiliza identidade canônica sem misturar decisões', async t => {
  await clearTestCache();
  t.after(clearTestCache);

  await AiDecisionCacheService.set(tenantId, 'TEST_DECISION', { query: 'filtro', context: { model: '143RII', pnc: '967332904' } }, { value: 'A' }, 60_000);

  const same = await AiDecisionCacheService.get<{ value: string }>(tenantId, 'TEST_DECISION', { context: { pnc: '967332904', model: '143RII' }, query: 'filtro' });
  const other = await AiDecisionCacheService.get<{ value: string }>(tenantId, 'TEST_DECISION', { query: 'filtro', context: { model: '125B' } });

  assert.deepEqual(same, { value: 'A' });
  assert.equal(other, null);
});
