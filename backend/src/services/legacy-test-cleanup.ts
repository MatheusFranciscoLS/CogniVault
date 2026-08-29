import { prisma } from '../config/prisma';

const DUMMY_PDF_URL = 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';
const LEGACY_CUTOFF = new Date('2026-08-27T00:00:00.000Z');
const LEGACY_FILENAMES = new Set(['dummy.pdf', 'documento_enviado.pdf', 'documento_teste.pdf']);

export const LEGACY_TEST_DOCUMENT_IDS = [
  '3db5e285-8e9e-4007-98f9-26d1942aaba4',
  '359d78c9-ac8b-4178-aae3-06c59bb1a044',
  '4c8e60f3-4ae3-4c9c-96c9-75cf6a171512',
  '8b2050c7-ded9-44f4-832c-9e7dddf6be54',
  '272a7d13-ac4d-470c-ad09-a2f92f77960b',
  '80dc41d9-729f-4b2e-bead-72e7c8dc5299',
  '9dd10984-2dbb-47f9-9f01-277eb379b47e',
  'd0bd7ebb-c602-4032-8df4-7abc79d69d04',
  '5bf3b0b3-8927-41bc-8b30-f57934d9a80f',
  'abad329b-22d8-425b-baa8-814c4c3b7da1',
  'f2ee22e0-f691-462c-924a-5deba0ac3089',
  '14536278-5235-4b50-a119-2d4fbe7c54fe',
  '57f2983b-f278-4990-8d8a-3c5b2e64aff6',
  '367daefc-220f-4cad-bbf4-38af1374b629',
  'fad8dd2e-f85b-482f-ada0-106b7dab4b2b',
  'abe4f486-82ee-46f6-9b0f-574ea3d28520',
  '8c72163d-c8e2-42ad-a96c-181ab93f91c1',
  '5b1045a1-eb79-4ef2-a672-3806b35fbaa2',
  'df94aefe-59c4-4563-ba8b-285bdb4ad3d4',
  'eccb9b03-ae3f-43e6-9fa4-1b896406c312',
  '6c86a9ed-7015-4fd7-9979-b0ead5497dcf',
] as const;

export type LegacyTestCandidate = {
  id: string;
  filename: string;
  url: string;
  storagePath: string | null;
  contentHash: string | null;
  status: string;
  processingStage: string;
  processingJobId: string | null;
  manufacturer: string | null;
  model: string | null;
  pnc: string | null;
  categoryId: string | null;
  extractionSnapshot: unknown;
  extractionMethod: string | null;
  extractedAt: Date | null;
  createdAt: Date;
  _count: { parts: number; chunks: number; favorites: number };
};

export function isLegacyTestCandidate(row: LegacyTestCandidate): boolean {
  return LEGACY_FILENAMES.has(row.filename)
    && row.url === DUMMY_PDF_URL
    && row.storagePath === null
    && row.contentHash === null
    && row.processingStage === 'IDLE'
    && row.processingJobId === null
    && (row.status === 'FAILED' || row.status === 'COMPLETED')
    && row.manufacturer === null
    && row.model === null
    && row.pnc === null
    && row.categoryId === null
    && row.extractionSnapshot === null
    && row.extractionMethod === null
    && row.extractedAt === null
    && row.createdAt < LEGACY_CUTOFF
    && row._count.parts === 0
    && row._count.chunks === 0
    && row._count.favorites === 0;
}

export async function cleanupLegacyTestDocuments(): Promise<{ deleted: number; skipped: string[] }> {
  const rows = await prisma.document.findMany({
    where: { id: { in: [...LEGACY_TEST_DOCUMENT_IDS] } },
    select: {
      id: true,
      tenantId: true,
      filename: true,
      url: true,
      storagePath: true,
      contentHash: true,
      status: true,
      processingStage: true,
      processingJobId: true,
      manufacturer: true,
      model: true,
      pnc: true,
      categoryId: true,
      extractionSnapshot: true,
      extractionMethod: true,
      extractedAt: true,
      createdAt: true,
      _count: { select: { parts: true, chunks: true, favorites: true } },
    },
  });

  const eligible = rows.filter(isLegacyTestCandidate);
  const eligibleIds = eligible.map(row => row.id);
  const skipped = rows.filter(row => !isLegacyTestCandidate(row)).map(row => row.id);
  if (!eligibleIds.length) return { deleted: 0, skipped };

  await prisma.$transaction([
    prisma.auditLog.createMany({
      data: eligible.map(row => ({
        tenantId: row.tenantId,
        userId: null,
        action: 'LEGACY_TEST_DOCUMENT_PURGED',
        targetType: 'DOCUMENT',
        targetId: row.id,
        metadata: { filename: row.filename, reason: 'Obsolete W3C dummy PDF test record with no stored file, metadata or indexed content.' },
      })),
    }),
    prisma.document.deleteMany({ where: { id: { in: eligibleIds } } }),
  ]);

  return { deleted: eligibleIds.length, skipped };
}
