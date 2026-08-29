import { prisma } from '../config/prisma';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';

export type CatalogHealthInput = {
  manufacturer?: string | null;
  model?: string | null;
  pnc?: string | null;
  extractedModels?: string[];
  extractedPncs?: string[];
  snapshotPartCount?: number;
  partCount: number;
  partsWithPage: number;
  partsWithSection: number;
  partsWithPosition?: number;
  chunkCount: number;
  embeddedPartCount: number;
  conflictingOccurrenceCount?: number;
  duplicateOccurrenceCount?: number;
  modelMismatchCount?: number;
  pncMismatchCount?: number;
  malformedPartNumberCount?: number;
  extractionMethod?: string | null;
  processingStage?: string | null;
  category?: string | null;
  previouslyReviewed?: boolean;
};

export type CatalogHealth = {
  score: number;
  reviewStatus: 'READY' | 'NEEDS_REVIEW' | 'REVIEWED';
  reasons: string[];
  warnings: string[];
};

type Finding = { message: string; penalty: number; review: boolean };

type HealthPart = {
  model: string;
  normalizedModel: string;
  pnc: string | null;
  normalizedPnc: string | null;
  universalAcrossPnc: boolean;
  page: number | null;
  section: string | null;
  position: string | null;
  normalizedPartNumber: string;
};

function text(value: string | null | undefined): string {
  return (value || '').trim();
}

function unique(values: string[] | undefined): string[] {
  return [...new Set((values || []).map(value => value.trim()).filter(Boolean))];
}

function safeCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value || 0)) : 0;
}

function partOccurrenceKey(part: HealthPart): string | null {
  const position = normalizeIdentifier(part.position);
  if (!position) return null;
  const model = part.normalizedModel || normalizeIdentifier(part.model) || '?';
  const pnc = part.universalAcrossPnc ? '*' : (part.normalizedPnc || normalizeIdentifier(part.pnc) || '?');
  const page = part.page || 0;
  const section = normalizeText(part.section || '?');
  return `${model}|${pnc}|${page}|${section}|${position}`;
}

function structuralDiagnostics(parts: HealthPart[], documentModel?: string | null, documentPnc?: string | null) {
  const occurrenceCodes = new Map<string, string[]>();
  const normalizedDocumentModel = normalizeIdentifier(documentModel);
  const normalizedDocumentPnc = normalizeIdentifier(documentPnc);
  let modelMismatchCount = 0;
  let pncMismatchCount = 0;
  let malformedPartNumberCount = 0;

  for (const part of parts) {
    const occurrence = partOccurrenceKey(part);
    if (occurrence) {
      const codes = occurrenceCodes.get(occurrence) || [];
      codes.push(part.normalizedPartNumber);
      occurrenceCodes.set(occurrence, codes);
    }
    if (normalizedDocumentModel && part.normalizedModel && part.normalizedModel !== normalizedDocumentModel) {
      modelMismatchCount += 1;
    }
    if (
      normalizedDocumentPnc
      && !part.universalAcrossPnc
      && part.normalizedPnc
      && part.normalizedPnc !== normalizedDocumentPnc
    ) {
      pncMismatchCount += 1;
    }
    const code = normalizeIdentifier(part.normalizedPartNumber);
    const digitCount = code.replace(/\D/g, '').length;
    if (code.length < 6 || code.length > 18 || digitCount < 4) malformedPartNumberCount += 1;
  }

  let conflictingOccurrenceCount = 0;
  let duplicateOccurrenceCount = 0;
  for (const codes of occurrenceCodes.values()) {
    const uniqueCodes = new Set(codes.filter(Boolean));
    if (uniqueCodes.size > 1) conflictingOccurrenceCount += 1;
    if (codes.length > uniqueCodes.size) duplicateOccurrenceCount += codes.length - uniqueCodes.size;
  }

  return {
    conflictingOccurrenceCount,
    duplicateOccurrenceCount,
    modelMismatchCount,
    pncMismatchCount,
    malformedPartNumberCount,
  };
}

/**
 * Mede a qualidade operacional do catálogo sem tentar "corrigir" o conteúdo.
 * O score só informa quanta evidência estrutural foi extraída. Falta de embedding
 * reduz pouco porque a busca textual continua válida; ambiguidade de modelo/PNC
 * e conflitos internos são revisão humana porque podem trocar aplicação/código.
 */
export function assessCatalogHealth(input: CatalogHealthInput): CatalogHealth {
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const models = unique(input.extractedModels);
  const pncs = unique(input.extractedPncs);
  const partCount = Math.max(0, input.partCount || 0);
  const snapshotPartCount = safeCount(input.snapshotPartCount);
  const conflictingOccurrenceCount = safeCount(input.conflictingOccurrenceCount);
  const duplicateOccurrenceCount = safeCount(input.duplicateOccurrenceCount);
  const modelMismatchCount = safeCount(input.modelMismatchCount);
  const pncMismatchCount = safeCount(input.pncMismatchCount);
  const malformedPartNumberCount = safeCount(input.malformedPartNumberCount);

  if (!text(input.manufacturer)) findings.push({ message: 'Fabricante não confirmado no catálogo.', penalty: 8, review: true });
  if (!text(input.model)) findings.push({ message: 'Modelo não confirmado no catálogo.', penalty: 30, review: true });
  if (!text(input.model) && models.length > 1) findings.push({ message: `O PDF contém mais de um modelo (${models.join(', ')}). Confirme qual escopo deve ser usado.`, penalty: 12, review: true });
  if (!text(input.pnc) && pncs.length > 1) findings.push({ message: `O PDF contém mais de um PNC (${pncs.join(', ')}). A aplicação precisa ser confirmada por PNC.`, penalty: 22, review: true });

  if (partCount === 0) findings.push({ message: 'Nenhuma peça ativa foi extraída.', penalty: 60, review: true });
  else if (partCount < 10) findings.push({ message: `Somente ${partCount} peças foram extraídas; confira se o catálogo foi lido por completo.`, penalty: 24, review: true });

  if (snapshotPartCount >= 10 && partCount > 0) {
    const persistenceRatio = partCount / snapshotPartCount;
    if (persistenceRatio < 0.7) {
      findings.push({
        message: `Apenas ${partCount} de ${snapshotPartCount} linhas extraídas chegaram à base ativa; revise possíveis linhas descartadas ou extração incompleta.`,
        penalty: 20,
        review: true,
      });
    } else if (persistenceRatio < 0.9) {
      warnings.push(`${snapshotPartCount - partCount} linha(s) do snapshot extraído não aparecem como peças ativas.`);
    }
  }

  if (partCount > 0) {
    const pageRatio = Math.max(0, Math.min(1, input.partsWithPage / partCount));
    const sectionRatio = Math.max(0, Math.min(1, input.partsWithSection / partCount));
    const positionCount = input.partsWithPosition === undefined ? partCount : Math.max(0, input.partsWithPosition);
    const positionRatio = Math.max(0, Math.min(1, positionCount / partCount));
    if (pageRatio < 0.5) findings.push({ message: 'Menos da metade das peças possui página de origem identificada.', penalty: 14, review: true });
    else if (pageRatio < 0.9) warnings.push('Algumas peças não possuem página de origem identificada.');
    if (sectionRatio < 0.5) findings.push({ message: 'Menos da metade das peças possui seção/vista identificada.', penalty: 16, review: true });
    else if (sectionRatio < 0.9) warnings.push('Algumas peças não possuem seção/vista identificada.');
    if (positionRatio < 0.5) findings.push({ message: 'Menos da metade das peças possui posição da vista explodida identificada.', penalty: 14, review: true });
    else if (positionRatio < 0.9) warnings.push('Algumas peças não possuem posição da vista explodida identificada.');
  }

  if (conflictingOccurrenceCount > 0) {
    findings.push({
      message: `${conflictingOccurrenceCount} posição(ões) técnica(s) da mesma vista estão associadas a mais de um código ativo.`,
      penalty: Math.min(32, 16 + conflictingOccurrenceCount * 4),
      review: true,
    });
  }
  if (duplicateOccurrenceCount > 0) {
    warnings.push(`${duplicateOccurrenceCount} ocorrência(s) idêntica(s) parecem duplicadas na extração.`);
  }
  if (modelMismatchCount > 0) {
    findings.push({
      message: `${modelMismatchCount} peça(s) ativa(s) possuem modelo diferente do modelo confirmado no catálogo.`,
      penalty: Math.min(32, 18 + modelMismatchCount),
      review: true,
    });
  }
  if (pncMismatchCount > 0) {
    findings.push({
      message: `${pncMismatchCount} peça(s) ativa(s) possuem PNC diferente do PNC confirmado no catálogo.`,
      penalty: Math.min(34, 20 + pncMismatchCount),
      review: true,
    });
  }
  if (malformedPartNumberCount > 0) {
    findings.push({
      message: `${malformedPartNumberCount} código(s) possuem formato estrutural inesperado e precisam de conferência no PDF.`,
      penalty: Math.min(28, 14 + malformedPartNumberCount * 2),
      review: true,
    });
  }

  if (partCount > 0 && input.chunkCount === 0) warnings.push('Memória técnica por página/seção ainda não foi gerada.');
  if (partCount > 0 && input.embeddedPartCount === 0) warnings.push('Índice vetorial indisponível; busca textual e fuzzy continuam ativas.');
  else if (partCount > 0 && input.embeddedPartCount < partCount) warnings.push('Índice vetorial está parcialmente concluído.');

  const method = text(input.extractionMethod).toUpperCase();
  if (method.startsWith('GEMINI:')) warnings.push('Extração visual por IA: recomenda-se revisão amostral das primeiras consultas.');
  if (text(input.processingStage).includes('WARNING') || text(input.processingStage).includes('WITHOUT_EMBEDDINGS')) {
    warnings.push('O último processamento terminou com aviso.');
  }
  if (text(input.category) === 'Outros / Não identificado') warnings.push('Família técnica não identificada automaticamente.');

  const penalty = findings.reduce((sum, finding) => sum + finding.penalty, 0)
    + Math.min(12, warnings.length * 2);
  const score = Math.max(0, Math.min(100, 100 - penalty));
  const requiresReview = findings.some(finding => finding.review);
  const reviewStatus = requiresReview
    ? 'NEEDS_REVIEW'
    : input.previouslyReviewed
      ? 'REVIEWED'
      : 'READY';

  return {
    score,
    reviewStatus,
    reasons: findings.map(finding => finding.message),
    warnings,
  };
}

export async function refreshCatalogHealth(documentId: string, tenantId: string): Promise<CatalogHealth | null> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, tenantId, processingStage: { not: 'REMOVED' } },
    select: {
      id: true,
      manufacturer: true,
      model: true,
      pnc: true,
      extractionSnapshot: true,
      extractionMethod: true,
      processingStage: true,
      reviewStatus: true,
      category: { select: { name: true } },
      _count: { select: { chunks: true } },
    },
  });
  if (!document) return null;

  const snapshot = document.extractionSnapshot && typeof document.extractionSnapshot === 'object' && !Array.isArray(document.extractionSnapshot)
    ? document.extractionSnapshot as Record<string, unknown>
    : null;
  const extractedModels = Array.isArray(snapshot?.models) ? snapshot.models.filter((value): value is string => typeof value === 'string') : [];
  const extractedPncs = Array.isArray(snapshot?.pncs) ? snapshot.pncs.filter((value): value is string => typeof value === 'string') : [];
  const snapshotPartCount = Array.isArray(snapshot?.parts) ? snapshot.parts.length : 0;

  const [parts, partsWithPage, partsWithSection, partsWithPosition, embeddedPartCount] = await Promise.all([
    prisma.part.findMany({
      where: { documentId, active: true },
      select: {
        model: true,
        normalizedModel: true,
        pnc: true,
        normalizedPnc: true,
        universalAcrossPnc: true,
        page: true,
        section: true,
        position: true,
        normalizedPartNumber: true,
      },
    }),
    prisma.part.count({ where: { documentId, active: true, page: { not: null } } }),
    prisma.part.count({ where: { documentId, active: true, section: { not: null } } }),
    prisma.part.count({ where: { documentId, active: true, position: { not: null } } }),
    prisma.part.count({ where: { documentId, active: true, embeddingRevision: { gt: 0 } } }),
  ]);

  const diagnostics = structuralDiagnostics(parts, document.model, document.pnc);
  const health = assessCatalogHealth({
    manufacturer: document.manufacturer,
    model: document.model,
    pnc: document.pnc,
    extractedModels,
    extractedPncs,
    snapshotPartCount,
    partCount: parts.length,
    partsWithPage,
    partsWithSection,
    partsWithPosition,
    chunkCount: document._count.chunks,
    embeddedPartCount,
    ...diagnostics,
    extractionMethod: document.extractionMethod,
    processingStage: document.processingStage,
    category: document.category?.name,
    previouslyReviewed: document.reviewStatus === 'REVIEWED',
  });

  await prisma.document.update({
    where: { id: document.id },
    data: {
      healthScore: health.score,
      reviewStatus: health.reviewStatus,
      reviewReasons: [...health.reasons, ...health.warnings],
      qualityCheckedAt: new Date(),
    },
  });
  return health;
}
