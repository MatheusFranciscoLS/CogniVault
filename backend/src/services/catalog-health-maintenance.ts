import { prisma } from '../config/prisma';
import { refreshCatalogHealth } from './catalog-health';

const LEGACY_OCCURRENCE_CONFLICT = /posi(?:ç|c)[aã]o\(ões\).*vista técnica comprovada possuem mais de um código ativo sem regra de PNC, série ou mercado/i;

export type CatalogHealthMaintenanceResult = {
  found: number;
  refreshed: number;
  failed: number;
};

export function hasLegacyOccurrenceConflictWarning(reviewReasons: unknown): boolean {
  if (!Array.isArray(reviewReasons)) return false;
  return reviewReasons.some(reason => typeof reason === 'string' && LEGACY_OCCURRENCE_CONFLICT.test(reason));
}

/**
 * Recalcula somente documentos que ainda carregam o diagnóstico de conflito da
 * versão anterior. É uma manutenção idempotente: depois da primeira execução o
 * texto legado deixa de existir e as próximas inicializações não fazem escrita.
 * Peças, PDFs e metadados técnicos não são alterados.
 */
export async function refreshLegacyCatalogHealth(): Promise<CatalogHealthMaintenanceResult> {
  const documents = await prisma.document.findMany({
    where: {
      archivedAt: null,
      status: 'COMPLETED',
      processingStage: { not: 'REMOVED' },
    },
    select: {
      id: true,
      tenantId: true,
      filename: true,
      reviewReasons: true,
    },
  });

  const stale = documents.filter(document => hasLegacyOccurrenceConflictWarning(document.reviewReasons));
  const result: CatalogHealthMaintenanceResult = { found: stale.length, refreshed: 0, failed: 0 };

  for (const document of stale) {
    try {
      await refreshCatalogHealth(document.id, document.tenantId);
      result.refreshed += 1;
    } catch (error) {
      result.failed += 1;
      console.warn(`⚠️ Não foi possível recalcular a saúde legada de ${document.filename}:`, error);
    }
  }

  return result;
}
