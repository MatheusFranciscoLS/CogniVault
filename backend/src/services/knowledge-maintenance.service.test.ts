import assert from 'node:assert/strict';
import test from 'node:test';
import { isKnowledgeMaintenanceConcurrencySkip } from './knowledge-maintenance.service';

test('knowledge maintenance treats expected concurrent state changes as skips', () => {
  assert.equal(isKnowledgeMaintenanceConcurrencySkip('DOCUMENT_PROCESSING'), true);
  assert.equal(isKnowledgeMaintenanceConcurrencySkip('STALE_DOCUMENT_MEMORY_REVISION'), true);
  assert.equal(isKnowledgeMaintenanceConcurrencySkip('CATALOG_HEALTH_STALE'), true);
});

test('knowledge maintenance still reports unrelated failures', () => {
  assert.equal(isKnowledgeMaintenanceConcurrencySkip('DATABASE_UNAVAILABLE'), false);
  assert.equal(isKnowledgeMaintenanceConcurrencySkip(''), false);
});
