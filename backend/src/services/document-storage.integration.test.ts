import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { prisma } from '../config/prisma';
import { storageBucket, supabase } from '../config/supabase-storage';
import { DocumentProducer } from '../queues/producer';
import { DocumentService } from './document.service';

const tenantId = 'tenant-storage-test';
const documentId = 'document-storage-test';

function replaceMethod(object: any, name: string, implementation: (...args: any[]) => any, restore: Array<() => void>) {
  const original = object[name];
  object[name] = implementation;
  restore.push(() => { object[name] = original; });
}

function document(overrides: Record<string, unknown> = {}) {
  return {
    id: documentId,
    tenantId,
    filename: 'Catálogo.pdf',
    url: `${tenantId}/${documentId}.pdf`,
    storagePath: `${tenantId}/${documentId}.pdf`,
    status: 'COMPLETED',
    processingJobId: null,
    processingStage: 'READY',
    processingError: null,
    archivedAt: null,
    archivedById: null,
    ...overrides,
  };
}

function bucket(overrides: Record<string, unknown> = {}) {
  return {
    upload: async () => ({ data: { path: `${tenantId}/new.pdf` }, error: null }),
    download: async () => ({ data: new Blob(['%PDF-1.7']), error: null }),
    createSignedUrl: async () => ({ data: { signedUrl: 'https://signed.example/catalog.pdf' }, error: null }),
    remove: async () => ({ data: [{ name: `${tenantId}/${documentId}.pdf` }], error: null }),
    ...overrides,
  };
}

test('upload sends a PDF to Storage and publishes only after the database row exists', async t => {
  const root = join(process.cwd(), `.storage-test-${process.pid}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, 'catalog.pdf');
  await writeFile(filePath, '%PDF-1.7 mocked');

  const calls: string[] = [];
  const restore: Array<() => void> = [];
  replaceMethod(prisma.document, 'findFirst', async () => null, restore);
  replaceMethod(prisma.document, 'create', async ({ data }: any) => {
    calls.push('database');
    return { ...document({ id: data.id, url: data.url, storagePath: data.storagePath, filename: data.filename }), ...data };
  }, restore);
  replaceMethod(supabase.storage, 'from', (() => ({
    ...bucket({
      upload: async (path: string, _body: Buffer, options: unknown) => {
        assert.equal(path.startsWith(`${tenantId}/`), true);
        assert.deepEqual(options, { contentType: 'application/pdf', upsert: false });
        calls.push('storage-upload');
        return { data: { path }, error: null };
      },
    }),
  })) as any, restore);
  replaceMethod(DocumentProducer, 'publishToQueue', async () => {
    calls.push('queue');
  }, restore);

  try {
    const result = await new DocumentService().handleNewUpload(tenantId, 'catalog.pdf', filePath);
    assert.equal(result.status, 'PENDING');
    assert.deepEqual(calls, ['storage-upload', 'database', 'queue']);
  } finally {
    await rm(root, { recursive: true, force: true });
    restore.reverse().forEach(restoreOne => restoreOne());
  }
});

test('database failure triggers compensatory Storage cleanup and retries transient removal', async t => {
  const root = join(process.cwd(), `.storage-test-${process.pid}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, 'catalog.pdf');
  await writeFile(filePath, '%PDF-1.7 mocked');
  let removals = 0;

  const restore: Array<() => void> = [];
  replaceMethod(prisma.document, 'findFirst', async () => null, restore);
  replaceMethod(prisma.document, 'create', async () => {
    throw new Error('database unavailable');
  }, restore);
  replaceMethod(supabase.storage, 'from', (() => ({
    ...bucket({
      remove: async (paths: string[]) => {
        removals += 1;
        assert.equal(paths.length, 1);
        assert.equal(paths[0].startsWith(`${tenantId}/`), true);
        if (removals < 3) return { data: null, error: { message: 'temporary storage error' } };
        return { data: [], error: null };
      },
    }),
  })) as any, restore);

  try {
    await assert.rejects(
      new DocumentService().handleNewUpload(tenantId, 'catalog.pdf', filePath),
      /database unavailable/,
    );
    assert.equal(removals, 3);
  } finally {
    await rm(root, { recursive: true, force: true });
    restore.reverse().forEach(restoreOne => restoreOne());
  }
});

test('signed URL uses download disposition, falls back across legacy paths, and preserves permission errors', async t => {
  const signedCalls: Array<[string, unknown]> = [];
  const restore: Array<() => void> = [];
  replaceMethod(prisma.document, 'findFirst', async () => document(), restore);
  replaceMethod(supabase.storage, 'from', (() => ({
    ...bucket({
      createSignedUrl: async (path: string, _ttl: number, options?: unknown) => {
        signedCalls.push([path, options]);
        if (signedCalls.length === 1) return { data: null, error: { message: 'permission denied' } };
        return { data: { signedUrl: 'https://signed.example/catalog.pdf' }, error: null };
      },
    }),
  })) as any, restore);

  try {
    const url = await new DocumentService().createAccessUrl(tenantId, documentId, true);
    assert.equal(url, 'https://signed.example/catalog.pdf');
    assert.deepEqual(signedCalls, [
      [`${tenantId}/${documentId}.pdf`, { download: 'Catálogo.pdf' }],
      [`${documentId}.pdf`, { download: 'Catálogo.pdf' }],
    ]);
  } finally {
    restore.reverse().forEach(restoreOne => restoreOne());
  }
});

test('removal archives nothing when Storage denies deletion, then succeeds after retry', async t => {
  const updates: unknown[] = [];
  let removals = 0;
  const restore: Array<() => void> = [];
  replaceMethod(prisma.document, 'findFirst', async () => document({ processingJobId: null }), restore);
  replaceMethod(prisma.document, 'updateMany', async () => ({ count: 1 }), restore);
  replaceMethod(prisma.document, 'update', async ({ data }: any) => {
    updates.push(data);
    return document(data);
  }, restore);
  replaceMethod(supabase.storage, 'from', (() => ({
    ...bucket({
      remove: async () => {
        removals += 1;
        return { data: null, error: { message: 'permission denied' } };
      },
    }),
  })) as any, restore);

  try {
    await assert.rejects(
      new DocumentService().removePdf(tenantId, documentId, 'admin-test'),
      /DOCUMENT_STORAGE_DELETE_FAILED:permission denied/,
    );
    assert.equal(removals, 3);
    assert.deepEqual(updates, [{
      archivedAt: null,
      archivedById: null,
      processingStage: 'READY',
      processingError: null,
    }]);
  } finally {
    restore.reverse().forEach(restoreOne => restoreOne());
  }
});
