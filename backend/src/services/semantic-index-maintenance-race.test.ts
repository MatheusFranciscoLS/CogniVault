import assert from 'node:assert/strict';
import test from 'node:test';
import { semanticBackfillWriteGuard } from './semantic-index-maintenance.service';

test('semantic part backfill is bound to the observed active extraction revision', () => {
  assert.deepEqual(semanticBackfillWriteGuard('Part', 7), {
    active: true,
    extractionRevision: 7,
  });
});

test('semantic technical-memory backfill is bound to the observed chunk revision', () => {
  assert.deepEqual(semanticBackfillWriteGuard('DocumentChunk', 4), {
    revision: 4,
  });
});
