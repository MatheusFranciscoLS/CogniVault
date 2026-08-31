import assert from 'node:assert/strict';
import test from 'node:test';
import {
  consumeSemanticQueryBudget,
  resetSemanticQueryBudgetForTests,
  semanticAdminBatchLimit,
  semanticChunkBudgetPerDocument,
  semanticPartBudgetPerDocument,
} from './semantic-indexing-policy';

test('limites semânticos ficam sempre dentro das faixas seguras', () => {
  const previous = {
    enabled: process.env.ENABLE_SEMANTIC_INDEXING,
    parts: process.env.SEMANTIC_PARTS_PER_DOCUMENT,
    chunks: process.env.SEMANTIC_CHUNKS_PER_DOCUMENT,
    batch: process.env.SEMANTIC_ADMIN_BATCH_LIMIT,
  };
  process.env.ENABLE_SEMANTIC_INDEXING = 'true';
  process.env.SEMANTIC_PARTS_PER_DOCUMENT = '99999';
  process.env.SEMANTIC_CHUNKS_PER_DOCUMENT = '-5';
  process.env.SEMANTIC_ADMIN_BATCH_LIMIT = '99999';
  assert.equal(semanticPartBudgetPerDocument(), 500);
  assert.equal(semanticChunkBudgetPerDocument(), 0);
  assert.equal(semanticAdminBatchLimit(), 500);
  for (const [key, value] of Object.entries({
    ENABLE_SEMANTIC_INDEXING: previous.enabled,
    SEMANTIC_PARTS_PER_DOCUMENT: previous.parts,
    SEMANTIC_CHUNKS_PER_DOCUMENT: previous.chunks,
    SEMANTIC_ADMIN_BATCH_LIMIT: previous.batch,
  })) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('freio horário interrompe apenas a semântica e reinicia na hora seguinte', () => {
  const previousEnabled = process.env.ENABLE_SEMANTIC_INDEXING;
  const previousLimit = process.env.SEMANTIC_QUERY_LIMIT_PER_HOUR;
  process.env.ENABLE_SEMANTIC_INDEXING = 'true';
  process.env.SEMANTIC_QUERY_LIMIT_PER_HOUR = '2';
  resetSemanticQueryBudgetForTests();
  assert.equal(consumeSemanticQueryBudget(new Date('2026-08-31T10:00:00Z')), true);
  assert.equal(consumeSemanticQueryBudget(new Date('2026-08-31T10:20:00Z')), true);
  assert.equal(consumeSemanticQueryBudget(new Date('2026-08-31T10:59:00Z')), false);
  assert.equal(consumeSemanticQueryBudget(new Date('2026-08-31T11:00:00Z')), true);
  if (previousEnabled === undefined) delete process.env.ENABLE_SEMANTIC_INDEXING;
  else process.env.ENABLE_SEMANTIC_INDEXING = previousEnabled;
  if (previousLimit === undefined) delete process.env.SEMANTIC_QUERY_LIMIT_PER_HOUR;
  else process.env.SEMANTIC_QUERY_LIMIT_PER_HOUR = previousLimit;
});
