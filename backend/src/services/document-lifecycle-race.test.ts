import assert from 'node:assert/strict';
import test from 'node:test';
import {
  idleDocumentReservationWhere,
  reprocessableDocumentReservationWhere,
  restorableDocumentLookupWhere,
} from './document-processing-state';

test('archive and remove reservation require the document to still be active and idle', () => {
  assert.deepEqual(idleDocumentReservationWhere('doc-1', 'tenant-1'), {
    id: 'doc-1',
    tenantId: 'tenant-1',
    archivedAt: null,
    OR: [
      { status: 'FAILED' },
      { processingJobId: null, status: { notIn: ['PENDING', 'PROCESSING'] } },
    ],
  });
});

test('failed documents remain recoverable even when they carry a stale processing job id', () => {
  const where = idleDocumentReservationWhere('doc-1', 'tenant-1');
  assert.deepEqual(where.OR?.[0], { status: 'FAILED' });
});

test('reprocess reservation cannot acquire archived, removing or removed documents', () => {
  assert.deepEqual(reprocessableDocumentReservationWhere('doc-1', 'tenant-1'), {
    id: 'doc-1',
    tenantId: 'tenant-1',
    archivedAt: null,
    OR: [
      { status: 'FAILED' },
      { processingJobId: null, status: { notIn: ['PENDING', 'PROCESSING'] } },
    ],
    processingStage: { notIn: ['REMOVING', 'REMOVED'] },
  });
});

test('restore cannot expose a document while its PDF is being removed or after removal', () => {
  assert.deepEqual(restorableDocumentLookupWhere('doc-1', 'tenant-1'), {
    id: 'doc-1',
    tenantId: 'tenant-1',
    archivedAt: { not: null },
    processingStage: { notIn: ['REMOVING', 'REMOVED'] },
  });
});
