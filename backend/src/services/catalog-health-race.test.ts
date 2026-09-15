import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogHealthSnapshotWhere } from './catalog-health';

test('catalog health persistence is bound to the exact observed catalog version and lifecycle state', () => {
  assert.deepEqual(catalogHealthSnapshotWhere({
    documentId: 'doc-1',
    tenantId: 'tenant-1',
    catalogRevision: 7,
    processingJobId: 'job-1',
    processingStage: 'READY',
    manufacturer: 'Husqvarna',
    model: '143RII',
    pnc: '966621501',
    categoryId: 'category-1',
    reviewStatus: 'READY',
  }), {
    id: 'doc-1',
    tenantId: 'tenant-1',
    processingStage: 'READY',
    processingJobId: 'job-1',
    catalogRevision: 7,
    manufacturer: 'Husqvarna',
    model: '143RII',
    pnc: '966621501',
    categoryId: 'category-1',
    reviewStatus: 'READY',
  });
});
