import { Prisma } from '@prisma/client';
import { GEMINI_EMBEDDING_MODEL, getGeminiClient } from '../config/gemini';
import { prisma } from '../config/prisma';
import { withTransientAIRetry } from '../utils/ai-retry';
import {
  semanticAdminBatchLimit,
  semanticDailyAdminRuns,
  semanticIndexingEnabled,
} from './semantic-indexing-policy';

type PendingSemanticRow = {
  id: string;
  searchText: string;
  revision: number;
};

export type SemanticIndexResult = {
  requested: number;
  partsIndexed: number;
  chunksIndexed: number;
  totalIndexed: number;
  remainingParts: number;
  remainingChunks: number;
};

function utcDayStart(now = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function pendingParts(tenantId: string, limit: number): Promise<PendingSemanticRow[]> {
  return prisma.$queryRaw<PendingSemanticRow[]>(Prisma.sql`
    SELECT p."id", p."searchText", p."extractionRevision" AS "revision"
    FROM "Part" p
    INNER JOIN "Document" d ON d."id" = p."documentId"
    WHERE d."tenantId" = ${tenantId}
      AND d."status" = 'COMPLETED'
      AND d."archivedAt" IS NULL
      AND p."active" = true
      AND (p."embedding" IS NULL OR p."embeddingRevision" <> p."extractionRevision")
    ORDER BY d."createdAt" ASC, p."createdAt" ASC
    LIMIT ${limit}
  `);
}

async function pendingChunks(tenantId: string, limit: number): Promise<PendingSemanticRow[]> {
  return prisma.$queryRaw<PendingSemanticRow[]>(Prisma.sql`
    SELECT c."id", c."searchText", c."revision"
    FROM "DocumentChunk" c
    INNER JOIN "Document" d ON d."id" = c."documentId"
    WHERE d."tenantId" = ${tenantId}
      AND d."status" = 'COMPLETED'
      AND d."archivedAt" IS NULL
      AND (c."embedding" IS NULL OR c."embeddingRevision" <> c."revision")
    ORDER BY d."createdAt" ASC, c."createdAt" ASC
    LIMIT ${limit}
  `);
}

async function embedRows(rows: PendingSemanticRow[], table: 'Part' | 'DocumentChunk'): Promise<number> {
  if (!rows.length) return 0;
  const ai = await getGeminiClient();
  const batchSize = 40;
  let indexed = 0;

  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const response = await withTransientAIRetry(
      () => ai.models.embedContent({
        model: GEMINI_EMBEDDING_MODEL,
        contents: batch.map(row => row.searchText),
        config: { outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT' },
      }),
      { label: `backfill semântico ${table} ${offset + 1}-${offset + batch.length}` },
    );
    const embeddings = response.embeddings || [];
    if (embeddings.length !== batch.length) throw new Error('Quantidade inválida de embeddings no lote administrativo.');

    await prisma.$transaction(async tx => {
      for (const [index, row] of batch.entries()) {
        const values = embeddings[index]?.values;
        if (!values || values.length !== 768) throw new Error('Embedding inválido no lote administrativo.');
        const vector = `[${values.join(',')}]`;
        if (table === 'Part') {
          await tx.$executeRaw`
            UPDATE "Part" SET "embedding" = ${vector}::vector, "embeddingRevision" = ${row.revision}
            WHERE "id" = ${row.id} AND "active" = true
          `;
        } else {
          await tx.$executeRaw`
            UPDATE "DocumentChunk" SET "embedding" = ${vector}::vector, "embeddingRevision" = ${row.revision}
            WHERE "id" = ${row.id}
          `;
        }
      }
    }, { maxWait: 10_000, timeout: 60_000 });
    indexed += batch.length;
  }
  return indexed;
}

export async function semanticIndexStatus(tenantId: string) {
  const [indexedParts, totalParts, indexedChunks, totalChunks, runsToday] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "Part" p INNER JOIN "Document" d ON d."id"=p."documentId"
      WHERE d."tenantId"=${tenantId} AND d."status"='COMPLETED' AND d."archivedAt" IS NULL AND p."active"=true
        AND p."embedding" IS NOT NULL AND p."embeddingRevision" = p."extractionRevision"
    `),
    prisma.part.count({ where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } } }),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "DocumentChunk" c INNER JOIN "Document" d ON d."id"=c."documentId"
      WHERE d."tenantId"=${tenantId} AND d."status"='COMPLETED' AND d."archivedAt" IS NULL
        AND c."embedding" IS NOT NULL AND c."embeddingRevision" = c."revision"
    `),
    prisma.documentChunk.count({ where: { document: { tenantId, archivedAt: null, status: 'COMPLETED' } } }),
    prisma.auditLog.count({ where: { tenantId, action: 'SEMANTIC_INDEX_BATCH', createdAt: { gte: utcDayStart() } } }),
  ]);
  const dailyRuns = semanticDailyAdminRuns();
  const indexedPartCount = Number(indexedParts[0]?.count || 0);
  const indexedChunkCount = Number(indexedChunks[0]?.count || 0);
  return {
    enabled: semanticIndexingEnabled(),
    indexedParts: indexedPartCount,
    totalParts,
    indexedChunks: indexedChunkCount,
    totalChunks,
    batchLimit: semanticAdminBatchLimit(),
    runsToday,
    dailyRuns,
    canRun: semanticIndexingEnabled() && runsToday < dailyRuns && indexedPartCount + indexedChunkCount < totalParts + totalChunks,
  };
}

export async function indexNextSemanticBatch(tenantId: string, userId: string | null, requested = semanticAdminBatchLimit()): Promise<SemanticIndexResult> {
  if (!semanticIndexingEnabled()) throw new Error('SEMANTIC_INDEXING_DISABLED');
  const runsToday = await prisma.auditLog.count({
    where: { tenantId, action: 'SEMANTIC_INDEX_BATCH', createdAt: { gte: utcDayStart() } },
  });
  if (runsToday >= semanticDailyAdminRuns()) throw new Error('SEMANTIC_DAILY_BUDGET_EXHAUSTED');

  const limit = Math.min(semanticAdminBatchLimit(), Math.max(10, Math.trunc(requested)));
  const partLimit = Math.max(1, Math.ceil(limit * 0.8));
  const chunkLimit = Math.max(0, limit - partLimit);
  const [partCandidates, chunkCandidates] = await Promise.all([
    pendingParts(tenantId, limit),
    pendingChunks(tenantId, limit),
  ]);
  let parts = partCandidates.slice(0, partLimit);
  let chunks = chunkCandidates.slice(0, chunkLimit);
  if (chunks.length < chunkLimit) parts = partCandidates.slice(0, Math.min(limit - chunks.length, partCandidates.length));
  if (parts.length < partLimit) chunks = chunkCandidates.slice(0, Math.min(limit - parts.length, chunkCandidates.length));

  const audit = parts.length || chunks.length ? await prisma.auditLog.create({
    data: {
      tenantId,
      userId,
      action: 'SEMANTIC_INDEX_BATCH',
      targetType: 'TENANT',
      targetId: tenantId,
      metadata: { status: 'STARTED', requested: limit, parts: parts.length, chunks: chunks.length },
    },
    select: { id: true },
  }) : null;

  let partsIndexed = 0;
  let chunksIndexed = 0;
  try {
    partsIndexed = await embedRows(parts, 'Part');
    chunksIndexed = await embedRows(chunks, 'DocumentChunk');
  } catch (error) {
    if (audit) {
      await prisma.auditLog.update({
        where: { id: audit.id },
        data: { metadata: { status: 'FAILED', error: (error instanceof Error ? error.message : String(error)).slice(0, 240), partsIndexed, chunksIndexed } },
      });
    }
    throw error;
  }
  const [remainingParts, remainingChunks] = await Promise.all([
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "Part" p INNER JOIN "Document" d ON d."id"=p."documentId"
      WHERE d."tenantId"=${tenantId} AND d."status"='COMPLETED' AND d."archivedAt" IS NULL AND p."active"=true
        AND (p."embedding" IS NULL OR p."embeddingRevision" <> p."extractionRevision")
    `),
    prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS "count" FROM "DocumentChunk" c INNER JOIN "Document" d ON d."id"=c."documentId"
      WHERE d."tenantId"=${tenantId} AND d."status"='COMPLETED' AND d."archivedAt" IS NULL
        AND (c."embedding" IS NULL OR c."embeddingRevision" <> c."revision")
    `),
  ]);
  const result = {
    requested: limit,
    partsIndexed,
    chunksIndexed,
    totalIndexed: partsIndexed + chunksIndexed,
    remainingParts: Number(remainingParts[0]?.count || 0),
    remainingChunks: Number(remainingChunks[0]?.count || 0),
  };
  if (audit) {
    await prisma.auditLog.update({ where: { id: audit.id }, data: { metadata: { status: 'COMPLETED', ...result } } });
  }
  return result;
}
