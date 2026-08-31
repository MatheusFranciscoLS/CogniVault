import { prisma } from '../config/prisma';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import { isLikelyHusqvarnaPnc, isPlausibleCatalogModel } from './catalog-extractor';

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
  partsWithInformativeSection?: number;
  partsWithPosition?: number;
  chunkCount: number;
  embeddedPartCount: number;
  conflictingOccurrenceCount?: number;
  variantOccurrenceCount?: number;
  uncertainOccurrenceCount?: number;
  applicationMismatchCount?: number;
  duplicateOccurrenceCount?: number;
  modelMismatchCount?: number;
  pncMismatchCount?: number;
  malformedPartNumberCount?: number;
  missingPositionCount?: number;
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

export type CatalogHealthPart = {
  model: string;
  normalizedModel: string;
  pnc: string | null;
  normalizedPnc: string | null;
  universalAcrossPnc: boolean;
  page: number | null;
  section: string | null;
  position: string | null;
  name: string;
  notes: string | null;
  normalizedPartNumber: string;
};

type SerialRange = { lower: bigint | null; upper: bigint | null };

const GENERIC_SECTION_NAMES = new Set([
  'pecas',
  'parts',
  'spare parts',
  'lista de pecas',
  'part list',
  'itens',
  'items',
]);

function text(value: string | null | undefined): string {
  return (value || '').trim();
}

function unique(values: string[] | undefined): string[] {
  return [...new Set((values || []).map(value => value.trim()).filter(Boolean))];
}

function safeCount(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(0, Math.trunc(value || 0)) : 0;
}

/**
 * Uma seção preenchida não é necessariamente contexto mecânico. O parser local
 * usa "Peças" como fallback quando o Portal não expõe o nome da vista; isso é
 * melhor que null para navegação, mas não deve valer como CLUTCH, TRANSMISSION,
 * CUTTING EQUIPMENT etc. na saúde técnica do catálogo.
 */
export function isInformativeCatalogSection(value: string | null | undefined): boolean {
  const normalized = normalizeText(value || '');
  return Boolean(normalized) && !GENERIC_SECTION_NAMES.has(normalized);
}

function partOccurrenceKey(part: CatalogHealthPart): string | null {
  const position = normalizeIdentifier(part.position);
  if (!position) return null;
  const model = part.normalizedModel || normalizeIdentifier(part.model) || '?';
  const pnc = part.universalAcrossPnc ? '*' : (part.normalizedPnc || normalizeIdentifier(part.pnc) || '?');
  const page = part.page || 0;
  const section = normalizeText(part.section || '?');
  return `${model}|${pnc}|${page}|${section}|${position}`;
}

function positionGroupKey(part: CatalogHealthPart): string | null {
  if (!part.page) return null;
  const model = part.normalizedModel || normalizeIdentifier(part.model) || '?';
  const pnc = part.universalAcrossPnc ? '*' : (part.normalizedPnc || normalizeIdentifier(part.pnc) || '?');
  const section = normalizeText(part.section || '?');
  return `${model}|${pnc}|${part.page}|${section}`;
}

function numericPosition(value: string | null | undefined): number | null {
  const normalized = text(value);
  if (!/^\d{1,3}$/.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isInteger(number) && number > 0 ? number : null;
}

/**
 * Conta saltos numéricos em vistas que parecem sequenciais. Isso é apenas um
 * diagnóstico: IPLs Husqvarna podem omitir números deliberadamente (por exemplo,
 * 1,2,4,5,7,8,9,10 no STARTER do 321R). A ausência de um número na ilustração
 * não prova que uma linha de peça deixou de ser extraída; completude deve ser
 * sustentada pela tabela/snapshot, não pelo maior número visível da vista.
 */
export function countLikelyMissingPositions(parts: CatalogHealthPart[]): number {
  const groups = new Map<string, Set<number>>();
  for (const part of parts) {
    const key = positionGroupKey(part);
    const position = numericPosition(part.position);
    if (!key || position === null) continue;
    const positions = groups.get(key) || new Set<number>();
    positions.add(position);
    groups.set(key, positions);
  }

  let missing = 0;
  for (const positions of groups.values()) {
    if (positions.size < 5 || !positions.has(1)) continue;
    const ordered = [...positions].sort((left, right) => left - right);
    const max = ordered[ordered.length - 1];
    if (max < 5) continue;
    const density = positions.size / max;
    if (density < 0.75) continue;
    for (let position = 1; position <= max; position += 1) {
      if (!positions.has(position)) missing += 1;
    }
  }
  return missing;
}

function applicabilityText(part: CatalogHealthPart): string {
  return [part.name, part.notes].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

function explicitPncRuleMismatch(part: CatalogHealthPart): boolean {
  const evidence = applicabilityText(part);
  const assigned = normalizeIdentifier(part.pnc).replace(/\D/g, '');
  const except = evidence.match(/\bFor\s+all\s+EXCEPT\s+([^\n.]+)/i);
  if (except) {
    const excluded = new Set((except[1].match(/\b(?:\d{11}|\d{9})\b/g) || []).filter(isLikelyHusqvarnaPnc).map(value => value.replace(/\D/g, '')));
    if (!excluded.size) return false;
    if (part.universalAcrossPnc || !assigned) return true;
    return excluded.has(assigned);
  }

  const direct = evidence.match(/\bFor\s+([^\n.]+)/i);
  if (direct) {
    const allowed = new Set((direct[1].match(/\b(?:\d{11}|\d{9})\b/g) || []).filter(isLikelyHusqvarnaPnc).map(value => value.replace(/\D/g, '')));
    if (!allowed.size) return false;
    if (part.universalAcrossPnc || !assigned) return true;
    return !allowed.has(assigned);
  }
  return false;
}

function serialNumber(value: string | undefined): bigint | null {
  if (!value || !/^\d{6,16}$/.test(value)) return null;
  try { return BigInt(value); } catch { return null; }
}

function serialRange(part: CatalogHealthPart): SerialRange | null {
  const evidence = applicabilityText(part).toUpperCase();
  const explicitUpper = evidence.match(/(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*(?:UP\s+TO|ATE)\s*[:#.-]?\s*(\d{6,16})\b/);
  const explicitLower = evidence.match(/(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*(?:FROM|A\s+PARTIR\s+DE)\s*[:#.-]?\s*(\d{6,16})\b/);
  if (explicitUpper || explicitLower) {
    return {
      lower: serialNumber(explicitLower?.[1]),
      upper: serialNumber(explicitUpper?.[1]),
    };
  }

  const directional = evidence.match(/(?:S\s*\/\s*N|SN|SERIAL(?:\s+NUMBER)?)\s*[:#.-]?\s*(\d{6,16})\s+(?:AND\s+)?(UP|ABOVE|BELOW|DOWN)\b/);
  if (directional) {
    const serial = serialNumber(directional[1]);
    if (serial === null) return null;
    return /^(?:UP|ABOVE)$/.test(directional[2])
      ? { lower: serial, upper: null }
      : { lower: null, upper: serial };
  }

  // IPLs antigos também usam a faixa compacta sem rótulo, por exemplo
  // 20090100001-20113100000 / 20113100001-Current. Procuramos isso somente em
  // notes para não confundir números presentes no nome/código da peça.
  const compactNotes = text(part.notes).toUpperCase();
  const compact = compactNotes.match(/(?:^|\s)(\d{8,16})\s*-\s*(\d{8,16}|CURRENT)(?:\s|$)/);
  if (compact) {
    return {
      lower: serialNumber(compact[1]),
      upper: compact[2] === 'CURRENT' ? null : serialNumber(compact[2]),
    };
  }
  return null;
}

function rangesAreDisjoint(left: SerialRange, right: SerialRange): boolean {
  if (left.upper !== null && right.lower !== null && left.upper < right.lower) return true;
  if (right.upper !== null && left.lower !== null && right.upper < left.lower) return true;
  return false;
}

function hasMutuallyExclusiveSerialVariants(parts: CatalogHealthPart[]): boolean {
  const byCode = new Map<string, SerialRange>();
  for (const part of parts) {
    const code = normalizeIdentifier(part.normalizedPartNumber);
    if (!code || byCode.has(code)) continue;
    const range = serialRange(part);
    if (!range) return false;
    byCode.set(code, range);
  }
  const ranges = [...byCode.values()];
  if (ranges.length < 2) return false;
  for (let left = 0; left < ranges.length; left += 1) {
    for (let right = left + 1; right < ranges.length; right += 1) {
      if (!rangesAreDisjoint(ranges[left], ranges[right])) return false;
    }
  }
  return true;
}

function marketTags(part: CatalogHealthPart): Set<string> {
  const evidence = normalizeText(applicabilityText(part));
  const tags = new Set<string>();
  if (/\b(?:latin america|latam|america latina)\b/.test(evidence)) tags.add('LATAM');
  if (/\basia\b/.test(evidence)) tags.add('ASIA');
  if (/\b(?:eu|europe|european)\b/.test(evidence)) tags.add('EU');
  if (/\b(?:au|australia|nz|new zealand)\b/.test(evidence)) tags.add('AU_NZ');
  if (/\b(?:us|usa|north america)\b/.test(evidence)) tags.add('US');
  return tags;
}

function setsOverlap(left: Set<string>, right: Set<string>): boolean {
  for (const value of left) if (right.has(value)) return true;
  return false;
}

function hasMutuallyExclusiveMarketVariants(parts: CatalogHealthPart[]): boolean {
  const byCode = new Map<string, Set<string>>();
  for (const part of parts) {
    const code = normalizeIdentifier(part.normalizedPartNumber);
    if (!code) continue;
    const tags = marketTags(part);
    const current = byCode.get(code) || new Set<string>();
    for (const tag of tags) current.add(tag);
    byCode.set(code, current);
  }
  const groups = [...byCode.values()];
  if (groups.length < 2 || groups.some(group => group.size === 0)) return false;
  for (let left = 0; left < groups.length; left += 1) {
    for (let right = left + 1; right < groups.length; right += 1) {
      if (setsOverlap(groups[left], groups[right])) return false;
    }
  }
  return true;
}

function isExplicitVariant(parts: CatalogHealthPart[]): boolean {
  return hasMutuallyExclusiveSerialVariants(parts) || hasMutuallyExclusiveMarketVariants(parts);
}

/**
 * Diagnostica conflitos somente quando a própria estrutura prova que se trata da
 * mesma ocorrência. PNC, página e seção fazem parte da chave. Se a seção é apenas
 * um fallback genérico, não afirmamos que duas posições pertencem à mesma vista.
 * Variantes mutuamente exclusivas por série ou mercado são cobertura legítima do
 * catálogo, não corrupção. Regras For/EXCEPT persistidas no PNC errado continuam
 * sendo tratadas como erro real de aplicação.
 */
export function diagnoseCatalogStructure(
  parts: CatalogHealthPart[],
  documentModel?: string | null,
  documentPnc?: string | null,
  extractedPncs: string[] = [],
) {
  const occurrences = new Map<string, CatalogHealthPart[]>();
  const normalizedDocumentModel = normalizeIdentifier(documentModel);
  const normalizedDocumentPnc = normalizeIdentifier(documentPnc);
  const allowedDocumentPncs = new Set([documentPnc || '', ...extractedPncs]
    .filter(isLikelyHusqvarnaPnc)
    .map(normalizeIdentifier));
  let modelMismatchCount = 0;
  let pncMismatchCount = 0;
  let malformedPartNumberCount = 0;
  let applicationMismatchCount = 0;

  for (const part of parts) {
    const occurrence = partOccurrenceKey(part);
    if (occurrence) {
      const rows = occurrences.get(occurrence) || [];
      rows.push(part);
      occurrences.set(occurrence, rows);
    }
    if (explicitPncRuleMismatch(part)) applicationMismatchCount += 1;
    if (normalizedDocumentModel && part.normalizedModel && part.normalizedModel !== normalizedDocumentModel) {
      modelMismatchCount += 1;
    }
    if (
      normalizedDocumentPnc
      && !part.universalAcrossPnc
      && part.normalizedPnc
      && (allowedDocumentPncs.size ? !allowedDocumentPncs.has(part.normalizedPnc) : part.normalizedPnc !== normalizedDocumentPnc)
    ) {
      pncMismatchCount += 1;
    }
    const code = normalizeIdentifier(part.normalizedPartNumber);
    const digitCount = code.replace(/\D/g, '').length;
    if (code.length < 6 || code.length > 18 || digitCount < 4) malformedPartNumberCount += 1;
  }

  let conflictingOccurrenceCount = 0;
  let variantOccurrenceCount = 0;
  let uncertainOccurrenceCount = 0;
  let duplicateOccurrenceCount = 0;
  for (const occurrenceParts of occurrences.values()) {
    const codes = occurrenceParts.map(part => normalizeIdentifier(part.normalizedPartNumber)).filter(Boolean);
    const uniqueCodes = new Set(codes);
    if (codes.length > uniqueCodes.size) duplicateOccurrenceCount += codes.length - uniqueCodes.size;
    if (uniqueCodes.size <= 1) continue;

    if (occurrenceParts.some(explicitPncRuleMismatch)) continue;
    if (isExplicitVariant(occurrenceParts)) {
      variantOccurrenceCount += 1;
      continue;
    }
    if (!isInformativeCatalogSection(occurrenceParts[0]?.section)) {
      uncertainOccurrenceCount += 1;
      continue;
    }
    conflictingOccurrenceCount += 1;
  }

  return {
    conflictingOccurrenceCount,
    variantOccurrenceCount,
    uncertainOccurrenceCount,
    applicationMismatchCount,
    duplicateOccurrenceCount,
    modelMismatchCount,
    pncMismatchCount,
    malformedPartNumberCount,
    missingPositionCount: countLikelyMissingPositions(parts),
  };
}

/**
 * A nota mede somente defeitos estruturais detectados. Avisos operacionais
 * (Gemini, embedding ausente, seção genérica etc.) continuam visíveis, mas não
 * reduzem a saúde: um catálogo sem defeito estrutural pode e deve chegar a 100.
 * Vários PNCs no mesmo IPL representam cobertura válida e não são penalizados.
 */
export function assessCatalogHealth(input: CatalogHealthInput): CatalogHealth {
  const findings: Finding[] = [];
  const warnings: string[] = [];
  const models = unique(input.extractedModels);
  const partCount = Math.max(0, input.partCount || 0);
  const snapshotPartCount = safeCount(input.snapshotPartCount);
  const conflictingOccurrenceCount = safeCount(input.conflictingOccurrenceCount);
  const variantOccurrenceCount = safeCount(input.variantOccurrenceCount);
  const uncertainOccurrenceCount = safeCount(input.uncertainOccurrenceCount);
  const applicationMismatchCount = safeCount(input.applicationMismatchCount);
  const duplicateOccurrenceCount = safeCount(input.duplicateOccurrenceCount);
  const modelMismatchCount = safeCount(input.modelMismatchCount);
  const pncMismatchCount = safeCount(input.pncMismatchCount);
  const malformedPartNumberCount = safeCount(input.malformedPartNumberCount);
  const missingPositionCount = safeCount(input.missingPositionCount);

  if (!text(input.manufacturer)) findings.push({ message: 'Fabricante não confirmado no catálogo.', penalty: 8, review: true });
  if (!text(input.model)) findings.push({ message: 'Modelo não confirmado no catálogo.', penalty: 30, review: true });
  else if (!isPlausibleCatalogModel(input.model)) findings.push({
    message: `“${text(input.model)}” não parece ser um modelo de equipamento; pode ser um título de peça ou uma descrição de peça/conjunto lida como modelo.`,
    penalty: 36,
    review: true,
  });
  if (!text(input.model) && models.length > 1) findings.push({ message: `O PDF contém mais de um modelo (${models.join(', ')}). Confirme qual escopo deve ser usado.`, penalty: 12, review: true });
  if (!text(input.pnc) && !(input.extractedPncs || []).some(isLikelyHusqvarnaPnc)) {
    warnings.push('PNC não identificado no PDF. Isso é comum em IPLs antigos; consulte por modelo e confirme a variante pela etiqueta quando necessário.');
  }

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
    const informativeSectionCount = input.partsWithInformativeSection === undefined
      ? input.partsWithSection
      : Math.max(0, input.partsWithInformativeSection);
    const informativeSectionRatio = Math.max(0, Math.min(1, informativeSectionCount / partCount));
    const positionCount = input.partsWithPosition === undefined ? partCount : Math.max(0, input.partsWithPosition);
    const positionRatio = Math.max(0, Math.min(1, positionCount / partCount));
    if (pageRatio < 0.5) findings.push({ message: 'Menos da metade das peças possui página de origem identificada.', penalty: 14, review: true });
    else if (pageRatio < 0.9) warnings.push('Algumas peças não possuem página de origem identificada.');
    if (sectionRatio < 0.5) findings.push({ message: 'Menos da metade das peças possui seção/vista identificada.', penalty: 16, review: true });
    else if (sectionRatio < 0.9) warnings.push('Algumas peças não possuem seção/vista identificada.');
    if (sectionRatio >= 0.5 && informativeSectionRatio < 0.25) {
      warnings.push('A maioria das peças possui apenas seção genérica (ex.: “Peças”); a busca continua válida, mas há menos contexto de conjunto/vista para desempate mecânico.');
    } else if (informativeSectionRatio < 0.75) {
      warnings.push('Parte das peças possui seção genérica; o contexto mecânico por vista está incompleto.');
    }
    if (positionRatio < 0.5) findings.push({ message: 'Menos da metade das peças possui posição da vista explodida identificada.', penalty: 14, review: true });
    else if (positionRatio < 0.9) warnings.push('Algumas peças não possuem posição da vista explodida identificada.');
  }

  if (missingPositionCount > 0) {
    warnings.push(`${missingPositionCount} salto(s) na numeração de posições foram detectados. Isso pode ser normal no IPL e não é tratado como peça faltando sem evidência adicional da tabela.`);
  }
  if (applicationMismatchCount > 0) {
    findings.push({
      message: `${applicationMismatchCount} ocorrência(s) possuem PNC persistido incompatível com a própria regra “For/EXCEPT” do catálogo. Reextraia este PDF para corrigir a aplicação.`,
      penalty: Math.min(36, 20 + applicationMismatchCount),
      review: true,
    });
  }
  if (conflictingOccurrenceCount > 0) {
    findings.push({
      message: `${conflictingOccurrenceCount} posição(ões) de vista técnica comprovada possuem mais de um código ativo sem regra de PNC, série ou mercado que os diferencie.`,
      penalty: Math.min(32, 16 + conflictingOccurrenceCount * 4),
      review: true,
    });
  }
  if (variantOccurrenceCount > 0) {
    warnings.push(`${variantOccurrenceCount} posição(ões) possuem variantes explícitas por número de série ou mercado; isso é cobertura válida do catálogo, não conflito.`);
  }
  if (uncertainOccurrenceCount > 0) {
    warnings.push(`${uncertainOccurrenceCount} posição(ões) em seção genérica possuem códigos distintos. Como a vista não está identificada, isso não é tratado automaticamente como conflito.`);
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

  const penalty = findings.reduce((sum, finding) => sum + finding.penalty, 0);
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
        name: true,
        notes: true,
        normalizedPartNumber: true,
      },
    }),
    prisma.part.count({ where: { documentId, active: true, page: { not: null } } }),
    prisma.part.count({ where: { documentId, active: true, section: { not: null } } }),
    prisma.part.count({ where: { documentId, active: true, position: { not: null } } }),
    prisma.part.count({ where: { documentId, active: true, embeddingRevision: { gt: 0 } } }),
  ]);

  const diagnostics = diagnoseCatalogStructure(parts, document.model, document.pnc, extractedPncs);
  const partsWithInformativeSection = parts.filter(part => isInformativeCatalogSection(part.section)).length;
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
    partsWithInformativeSection,
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
