import assert from 'node:assert/strict';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { DocumentService } from './document.service';

const idleDocument = {
  id: 'doc-1',
  tenantId: 'tenant-1',
  status: 'COMPLETED',
  processingJobId: null,
  processingStage: 'READY',
  processingCurrent: 10,
  processingTotal: 10,
  processingError: null,
  storagePath: 'tenant-1/doc-1.pdf',
  url: 'tenant-1/doc-1.pdf',
  contentHash: 'hash-1',
  filename: 'catalogo.pdf',
  archivedAt: null,
} as any;

test('archive refuses to continue when another lifecycle operation wins after the initial read', async (t) => {
  const service = new DocumentService();
  let reservation: any;

  t.mock.method(prisma.document as any, 'findFirst', async () => idleDocument);
  t.mock.method(prisma.document as any, 'updateMany', async (args: any) => {
    reservation = args;
    return { count: 0 };
  });

  await assert.rejects(
    service.archive('tenant-1', 'doc-1', 'user-1'),
    /DOCUMENT_ALREADY_PROCESSING/,
  );
  assert.equal(reservation.where.tenantId, 'tenant-1');
  assert.equal(reservation.where.archivedAt, null);
  assert.deepEqual(reservation.where.OR, [
    { status: 'FAILED' },
    { processingJobId: null, status: { notIn: ['PENDING', 'PROCESSING'] } },
  ]);
});

test('reprocess reservation cannot acquire an archived or removing document', async (t) => {
  const service = new DocumentService();
  let reservation: any;

  t.mock.method(prisma.document as any, 'findFirst', async () => idleDocument);
  t.mock.method(prisma.document as any, 'updateMany', async (args: any) => {
    reservation = args;
    return { count: 0 };
  });

  await assert.rejects(
    service.reprocess('tenant-1', 'doc-1'),
    /DOCUMENT_ALREADY_PROCESSING/,
  );
  assert.equal(reservation.where.archivedAt, null);
  assert.deepEqual(reservation.where.processingStage, { notIn: ['REMOVING', 'REMOVED'] });
});

test('remove reserves the idle document atomically before touching storage', async (t) => {
  const service = new DocumentService();
  let reservation: any;

  t.mock.method(prisma.document as any, 'findFirst', async () => idleDocument);
  t.mock.method(prisma.document as any, 'updateMany', async (args: any) => {
    reservation = args;
    return { count: 0 };
  });

  await assert.rejects(
    service.removePdf('tenant-1', 'doc-1', 'user-1'),
    /DOCUMENT_ALREADY_PROCESSING/,
  );
  assert.equal(reservation.where.tenantId, 'tenant-1');
  assert.equal(reservation.where.archivedAt, null);
  assert.equal(reservation.data.processingStage, 'REMOVING');
});

test('restore never exposes a document while its PDF is still being removed', async (t) => {
  const service = new DocumentService();
  let lookup: any;

  t.mock.method(prisma.document as any, 'findFirst', async (args: any) => {
    lookup = args;
    return null;
  });

  await assert.rejects(
    service.restore('tenant-1', 'doc-1'),
    /DOCUMENT_NOT_FOUND/,
  );
  assert.deepEqual(lookup.where.processingStage, { notIn: ['REMOVING', 'REMOVED'] });
});
