import assert from 'node:assert/strict';
import test from 'node:test';
import { autoMetadataRepairReservationWhere } from './catalog-metadata-repair';

test('automatic metadata repair is bound to the exact unreviewed document state it observed', () => {
  assert.deepEqual(autoMetadataRepairReservationWhere({
    documentId: 'doc-1',
    tenantId: 'tenant-1',
    manufacturer: 'Husqvarna',
    model: 'assy 321S',
    pnc: null,
    metadataReviewedAt: null,
    processingJobId: null,
  }), {
    id: 'doc-1',
    tenantId: 'tenant-1',
    archivedAt: null,
    manufacturer: 'Husqvarna',
    model: 'assy 321S',
    pnc: null,
    metadataReviewedAt: null,
    processingJobId: null,
  });
});
