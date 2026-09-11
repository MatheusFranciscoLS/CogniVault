import { prisma } from '../config/prisma';
import { ensureCatalogCategory } from './catalog-category-assignment';
import { refreshCatalogHealth } from './catalog-health';
import { rebuildDocumentMemory } from './document-memory';

export type KnowledgeBackfillResult = {
  catalogsFound: number;
  processed: number;
  skippedProcessing: number;
  chunksCreated: number;
  failed: number;
  failures: Array<{ documentId: string; filename: string; error: string }>;
};

export async function rebuildTenantTechnicalKnowledge(
  tenantId: string,
  limit = 250,
): Promise<KnowledgeBackfillResult> {
  const take = Math.max(1, Math.min(500, Math.trunc(limit)));
  const documents = await prisma.document.findMany({
    where: {
      tenantId,
      archivedAt: null,
      status: 'COMPLETED',
      processingStage: { not: 'REMOVED' },
      parts: { some: { active: true } },
    },
    orderBy: { createdAt: 'asc' },
    take,
    select: {
      id: true,
      filename: true,
      catalogRevision: true,
      processingJobId: true,
      parts: {
        where: { active: true },
        orderBy: [{ page: 'asc' }, { section: 'asc' }, { position: 'asc' }],
        select: {
          model: true,
          pnc: true,
          universalAcrossPnc: true,
          page: true,
          section: true,
          position: true,
          name: true,
          alternativeNames: true,
          notes: true,
        },
      },
    },
  });

  const result: KnowledgeBackfillResult = {
    catalogsFound: documents.length,
    processed: 0,
    skippedProcessing: 0,
    chunksCreated: 0,
    failed: 0,
    failures: [],
  };

  for (const document of documents) {
    if (document.processingJobId) {
      result.skippedProcessing += 1;
      continue;
    }

    try {
      const memory = await rebuildDocumentMemory(
        document.id,
        tenantId,
        Math.max(1, document.catalogRevision),
        document.parts,
        { embeddings: false, allowProcessing: false },
      );
      result.chunksCreated += memory.chunks;

      await ensureCatalogCategory(document.id, tenantId);
      await refreshCatalogHealth(document.id, tenantId);
      result.processed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message === 'DOCUMENT_PROCESSING' || message === 'STALE_DOCUMENT_MEMORY_REVISION') {
        result.skippedProcessing += 1;
        continue;
      }

      result.failed += 1;
      result.failures.push({
        documentId: document.id,
        filename: document.filename,
        error: message.slice(0, 240),
      });
    }
  }

  return result;
}
