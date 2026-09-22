import assert from 'node:assert/strict';
import test from 'node:test';
import { findOrphanStorageObjects } from './storage-reconciliation';

test('storage reconciliation preserves canonical and legacy document paths', () => {
  const orphans = findOrphanStorageObjects(
    [{
      tenantId: 'tenant-a',
      documentId: 'doc-1',
      storagePath: 'tenant-a/custom.pdf',
    }],
    [
      { tenantId: 'tenant-a', path: 'tenant-a/custom.pdf' },
      { tenantId: 'tenant-a', path: 'tenant-a/doc-1.pdf' },
      { tenantId: 'tenant-a', path: 'doc-1.pdf' },
      { tenantId: 'tenant-a', path: 'tenant-a/orphan.pdf' },
    ],
  );

  assert.deepEqual(orphans, [{ tenantId: 'tenant-a', path: 'tenant-a/orphan.pdf' }]);
});

test('storage reconciliation treats duplicate references as one known path', () => {
  const orphans = findOrphanStorageObjects(
    [{ tenantId: 'tenant-a', documentId: 'doc-1', storagePath: 'tenant-a/doc-1.pdf' }],
    [
      { tenantId: 'tenant-a', path: 'tenant-a/doc-1.pdf' },
      { tenantId: 'tenant-b', path: 'tenant-b/doc-1.pdf' },
    ],
  );

  assert.deepEqual(orphans, [{ tenantId: 'tenant-b', path: 'tenant-b/doc-1.pdf' }]);
});

test('storage reconciliation recognizes legacy root objects', () => {
  const orphans = findOrphanStorageObjects(
    [{ tenantId: 'tenant-a', documentId: 'doc-1', storagePath: null }],
    [
      { tenantId: '', path: 'doc-1.pdf' },
      { tenantId: '', path: 'orphan.pdf' },
    ],
  );

  assert.deepEqual(orphans, [{ tenantId: '', path: 'orphan.pdf' }]);
});
