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

/**
 * Atualiza a camada de conhecimento dos catálogos já existentes sem reextrair PDF,
 * sem alterar Part Number e sem reescrever as peças. O backfill usa somente Part
 * rows já ativos para gerar memória técnica textual, classificar a família e
 * recalcular a saúde estrutural.
 *
 * Registros históricos sem nenhuma peça ativa são ignorados de propósito: eles
 * continuam preservados no banco/auditoria, mas não representam um catálogo
 * técnico utilizável e não devem entrar em classificação, memória ou saúde.
 *
 * Embeddings ficam desligados aqui de propósito: a operação administrativa deve
 * ser previsível, rápida e não consumir cota externa. Novos processamentos seguem
 * a configuração normal de indexação semântica do worker.
 */
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
        { embeddings: false },
      );
      result.chunksCreated += memory.chunks;

      await ensureCatalogCategory(document.id, tenantId);
      await refreshCatalogHealth(document.id, tenantId);
      result.processed += 1;
    } catch (error) {
      result.failed += 1;
      result.failures.push({
        documentId: document.id,
        filename: document.filename,
        error: (error instanceof Error ? error.message : String(error)).slice(0, 240),
      });
    }
  }

  return result;
}
