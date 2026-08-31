import { prisma } from '../config/prisma';
import { refreshCatalogHealth } from './catalog-health';

const LEGACY_OCCURRENCE_CONFLICT = /posi(?:ç|c)[aã]o\(ões\).*vista técnica comprovada possuem mais de um código ativo sem regra de PNC, série ou mercado/i;
const EXTRACTOR_REPAIR_REQUIRED = /(?:PNC persistido incompatível com a própria regra|PNC\(s\) do equipamento parecem ter sido lidos como código de peça)/i;

export type CatalogHealthMaintenanceResult = {
  found: number;
  refreshed: number;
  failed: number;
  reextractQueued: number;
  reextractFailed: number;
};

export function hasLegacyOccurrenceConflictWarning(reviewReasons: unknown): boolean {
  if (!Array.isArray(reviewReasons)) return false;
  return reviewReasons.some(reason => typeof reason === 'string' && LEGACY_OCCURRENCE_CONFLICT.test(reason));
}

export function needsCatalogExtractorRepair(reviewReasons: unknown): boolean {
  if (!Array.isArray(reviewReasons)) return false;
  return reviewReasons.some(reason => typeof reason === 'string' && EXTRACTOR_REPAIR_REQUIRED.test(reason));
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
  const result: CatalogHealthMaintenanceResult = {
    found: stale.length,
    refreshed: 0,
    failed: 0,
    reextractQueued: 0,
    reextractFailed: 0,
  };

  for (const document of stale) {
    try {
      await refreshCatalogHealth(document.id, document.tenantId);
      result.refreshed += 1;
    } catch (error) {
      result.failed += 1;
      console.warn(`⚠️ Não foi possível recalcular a saúde legada de ${document.filename}:`, error);
    }
  }

  // Algumas versões antigas do parser persistiram linhas de cabeçalho de PNC
  // como se fossem peças ou interpretaram a grafia “For alll EXCEPT” de forma
  // invertida. Reprocessar é necessário para corrigir essas linhas. O fluxo de
  // reextração mantém as peças atuais até a nova extração passar pela barreira
  // de integridade, portanto uma falha não esvazia o catálogo em produção.
  const repairCandidates = await prisma.document.findMany({
    where: {
      archivedAt: null,
      status: 'COMPLETED',
      processingStage: { not: 'REMOVED' },
      processingJobId: null,
      storagePath: { not: null },
      reviewStatus: 'NEEDS_REVIEW',
    },
    select: {
      id: true,
      tenantId: true,
      filename: true,
      reviewReasons: true,
    },
  });
  const extractorRepairs = repairCandidates.filter(candidate => needsCatalogExtractorRepair(candidate.reviewReasons));
  if (!extractorRepairs.length) return result;

  // Carregamento tardio evita inicializar o cliente do Storage em processos que
  // apenas analisam saúde (testes, scripts e catálogos sem reparo pendente).
  const { DocumentService } = await import('./document.service.js');
  const documentService = new DocumentService();

  for (const document of extractorRepairs) {
    try {
      await documentService.reprocess(document.tenantId, document.id);
      result.reextractQueued += 1;
    } catch (error) {
      result.reextractFailed += 1;
      console.warn(`⚠️ Não foi possível reenfileirar a correção de ${document.filename}:`, error);
    }
  }

  return result;
}
