import assert from 'node:assert/strict';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import geminiConfig = require('../config/gemini');
import { prisma } from '../config/prisma';
import { supabase } from '../config/supabase-storage';
import { AIService } from './ai.service';

const tenantId = 'tenant-gemini-test';
const documentId = 'document-gemini-test';
const jobId = 'job-gemini-test';

function sourceDocument(filePath: string, fromStorage = false) {
  return {
    id: documentId,
    tenantId,
    filename: 'catalog.pdf',
    url: fromStorage ? 'legacy/catalog.pdf' : filePath,
    storagePath: fromStorage ? `${tenantId}/legacy/catalog.pdf` : null,
    status: 'PENDING',
    processingJobId: jobId,
    processingStage: 'QUEUED',
    processingError: null,
    processingTotal: 0,
    processingCurrent: 0,
    catalogRevision: 0,
    extractionSnapshot: null,
    extractionMethod: null,
    extractionFallbackReason: null,
    manufacturer: 'Husqvarna',
    model: '143RII',
    pnc: null,
  };
}

async function runWithGemini(t: test.TestContext, output: string, transientUpload = false, fromStorage = false) {
  const root = join(process.cwd(), `.gemini-test-${process.pid}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, 'catalog.pdf');
  await writeFile(filePath, '%PDF-1.7 mocked');

  const calls = { upload: 0, create: 0 };
  const client = {
    files: {
      upload: async () => {
        calls.upload += 1;
        if (transientUpload && calls.upload === 1) throw { status: 503, message: 'timeout' };
        return { name: 'files/mock', uri: 'https://files.example/mock' };
      },
      delete: async ({ name }: { name: string }) => {
        assert.equal(name, 'files/mock');
      },
    },
    interactions: {
      create: async () => {
        calls.create += 1;
        return { output_text: output };
      },
    },
  };

  const originalFindUnique = prisma.document.findUnique;
  const originalUpdateMany = prisma.document.updateMany;
  (prisma.document as any).findUnique = async () => sourceDocument(filePath, fromStorage);
  (prisma.document as any).updateMany = async () => ({ count: 1 });
  const originalClient = geminiConfig.getGeminiClient;
  const originalStorageFrom = supabase.storage.from;
  geminiConfig.getGeminiClient = async () => client as any;
  (supabase.storage as any).from = () => ({
    download: async () => ({ data: new Blob(['%PDF-1.7 mocked']), error: null }),
    upload: async () => ({ data: { path: `${tenantId}/${documentId}.pdf` }, error: null }),
  });
  try {
    await assert.rejects(() => AIService.processDocument(documentId, tenantId, jobId));
    return calls;
  } finally {
    (prisma.document as any).findUnique = originalFindUnique;
    (prisma.document as any).updateMany = originalUpdateMany;
    geminiConfig.getGeminiClient = originalClient;
    (supabase.storage as any).from = originalStorageFrom;
    await rm(root, { recursive: true, force: true });
  }
}

test('rejects malformed and partial Gemini JSON before persisting catalog data', async t => {
  const malformed = await runWithGemini(t, '{"manufacturer":"Husqvarna",');
  assert.deepEqual(malformed, { upload: 1, create: 1 });
  t.mock.restoreAll();

  const partial = await runWithGemini(t, JSON.stringify({ manufacturer: 'Husqvarna', models: [], pncs: [], parts: [] }));
  assert.deepEqual(partial, { upload: 1, create: 1 });
});

test('rejects an invented or structurally incompatible part instead of sending it to Prisma', async t => {
  const invented = JSON.stringify({
    manufacturer: 'Husqvarna',
    models: ['143RII'],
    pncs: [],
    parts: [{
      manufacturer: 'Husqvarna',
      model: '143RII',
      pnc: '',
      universalAcrossPnc: false,
      section: 'Engine',
      position: '1',
      positionStatus: 'POSITIONED',
      positionEvidence: '1',
      name: 'Invented part',
      alternativeNames: [],
      partNumber: '1',
      page: 1,
      notes: '',
    }],
  });
  const calls = await runWithGemini(t, invented);
  assert.deepEqual(calls, { upload: 1, create: 1 });
});

test('does not retry a real daily quota response from Gemini', async t => {
  const quota = {
    error: {
      code: 429,
      status: 'RESOURCE_EXHAUSTED',
      message: 'daily quota exceeded',
      details: [{ violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier' }] }],
    },
  };
  const root = join(process.cwd(), `.gemini-test-${process.pid}-${Date.now()}`);
  await mkdir(root, { recursive: true });
  const filePath = join(root, 'catalog.pdf');
  await writeFile(filePath, '%PDF-1.7 mocked');
  let uploads = 0;
  const client = {
    files: {
      upload: async () => {
        uploads += 1;
        throw quota;
      },
    },
  };
  const originalFindUnique = prisma.document.findUnique;
  const originalUpdateMany = prisma.document.updateMany;
  const originalClient = geminiConfig.getGeminiClient;
  const originalStorageFrom = supabase.storage.from;
  (prisma.document as any).findUnique = async () => sourceDocument(filePath);
  (prisma.document as any).updateMany = async () => ({ count: 1 });
  geminiConfig.getGeminiClient = async () => client as any;
  (supabase.storage as any).from = () => ({
    upload: async () => ({ data: { path: `${tenantId}/${documentId}.pdf` }, error: null }),
  });
  try {
    await assert.rejects(() => AIService.processDocument(documentId, tenantId, jobId), error => error === quota);
    assert.equal(uploads, 1);
  } finally {
    (prisma.document as any).findUnique = originalFindUnique;
    (prisma.document as any).updateMany = originalUpdateMany;
    geminiConfig.getGeminiClient = originalClient;
    (supabase.storage as any).from = originalStorageFrom;
    await rm(root, { recursive: true, force: true });
  }
});

test('retries a transient Gemini timeout and then handles the incompatible response', async t => {
  const calls = await runWithGemini(t, 'not-json', true);
  assert.equal(calls.upload, 2);
  assert.equal(calls.create, 1);
});

test('downloads a legacy Storage object before invoking the mocked Gemini client', async t => {
  const calls = await runWithGemini(t, JSON.stringify({ parts: [] }), false, true);
  assert.deepEqual(calls, { upload: 1, create: 1 });
});
