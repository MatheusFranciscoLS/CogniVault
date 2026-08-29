import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { getGeminiClient } from '../config/gemini';
import { normalizeIdentifier } from '../utils/normalize';
import type { SearchIntent } from './chat-intent.service';
import {
  buildSearchGroups,
  findPartConcepts,
  focusCandidatesByDescription,
  scorePartText,
  semanticQueryText,
} from './part-vocabulary';
import { relationSpecificityBonus } from './candidate-specificity';
import { applyFeedbackLearning } from './feedback-learning';
import { preferCurrentPartNumbers, resolveCurrentPartNumber } from './part-supersession';
import { normalizedReciprocalRankFusionScores } from './retrieval-fusion';
import { fullTextPartCandidates, fuzzyPartCandidates, type HybridTextCandidateRow } from './hybrid-part-retrieval';

const MAX_DISTANCE = Number(process.env.PART_SEARCH_MAX_DISTANCE || '0.65');

export type RetrievalSource = 'DIRECT_CODE' | 'SEMANTIC' | 'LEXICAL' | 'FULL_TEXT' | 'FUZZY';

export interface PartCandidate {
  id: string;
  documentId: string;
  filename: string;
  manufacturer: string | null;
  model: string;
  normalizedModel: string;
  pnc: string | null;
  normalizedPnc: string | null;
  universalAcrossPnc: boolean;
  section: string | null;
  position: string | null;
  name: string;
  alternativeNames: string[];
  partNumber: string;
  normalizedPartNumber: string;
  page: number | null;
  notes: string | null;
  distance: number;
  feedbackScore: number;
  searchMethod: 'DIRECT_CODE' | 'SEMANTIC' | 'LEXICAL';
  retrievalScore?: number;
  retrievalSources?: RetrievalSource[];
  retrievalAgreement?: number;
}

function technicalSectionIdentity(candidate: PartCandidate): string {
  const concepts = findPartConcepts(candidate.section || '').map(group => group.key).sort();
  if (concepts.length) return concepts.join('+');
  let section = normalizeIdentifier(candidate.section);
  const model = normalizeIdentifier(candidate.normalizedModel || candidate.model);
  if (model && section.startsWith(model)) section = section.slice(model.length);
  return section || '?';
}

function technicalOccurrenceKey(candidate: PartCandidate): string {
  const pnc = candidate.universalAcrossPnc ? '*' : (candidate.normalizedPnc || '');
  const position = normalizeIdentifier(candidate.position) || '?';
  return [candidate.normalizedPartNumber, candidate.normalizedModel, pnc, technicalSectionIdentity(candidate), position].join('|');
}

function mergedAliases(preferredName: string, ...values: string[][]): string[] {
  const seen = new Set<string>();
  const preferred = normalizeIdentifier(preferredName);
  const result: string[] = [];
  for (const value of values.flat()) {
    const normalized = normalizeIdentifier(value);
    if (!normalized || normalized === preferred || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(value);
  }
  return result;
}

function candidateSources(candidate: PartCandidate): RetrievalSource[] {
  return candidate.retrievalSources?.length ? candidate.retrievalSources : [candidate.searchMethod];
}

/** Preserva ocorrências técnicas diferentes mesmo quando compartilham o código. */
export function deduplicatePartCandidates(candidates: PartCandidate[]): PartCandidate[] {
  const byTechnicalOccurrence = new Map<string, PartCandidate>();
  for (const candidate of candidates) {
    const key = technicalOccurrenceKey(candidate);
    const current = byTechnicalOccurrence.get(key);
    if (!current) {
      byTechnicalOccurrence.set(key, {
        ...candidate,
        alternativeNames: [...candidate.alternativeNames],
        retrievalSources: [...candidateSources(candidate)],
      });
      continue;
    }

    const candidateRank = candidate.distance - candidate.feedbackScore;
    const currentRank = current.distance - current.feedbackScore;
    const candidateHasMoreContext = Boolean(candidate.notes && !current.notes);
    const preferCandidate = candidateRank < currentRank || (candidateRank === currentRank && candidateHasMoreContext);
    const preferred = preferCandidate ? candidate : current;
    const other = preferCandidate ? current : candidate;
    const sources = [...new Set([...candidateSources(current), ...candidateSources(candidate)])];
    byTechnicalOccurrence.set(key, {
      ...preferred,
      retrievalScore: Math.max(preferred.retrievalScore || 0, other.retrievalScore || 0) || undefined,
      retrievalSources: sources,
      retrievalAgreement: sources.length,
      alternativeNames: mergedAliases(
        preferred.name,
        preferred.alternativeNames,
        other.alternativeNames,
        preferred.name !== other.name ? [other.name] : [],
      ),
    });
  }
  return [...byTechnicalOccurrence.values()];
}

export function rankingEvidence(question: string, candidate: PartCandidate): number {
  const retrievalEvidence = candidate.retrievalScore ?? Math.max(0, 1 - candidate.distance);
  const agreement = candidate.retrievalAgreement || new Set(candidateSources(candidate)).size;
  const agreementBonus = Math.min(0.18, Math.max(0, agreement - 1) * 0.06);
  return retrievalEvidence
    + agreementBonus
    + candidate.feedbackScore
    + relationSpecificityBonus(question, {
      name: candidate.name,
      section: candidate.section,
      aliases: candidate.alternativeNames,
      notes: candidate.notes,
      pnc: candidate.pnc,
    }) * 0.55;
}

function rankCandidatesForQuestion(question: string, candidates: PartCandidate[]): PartCandidate[] {
  return [...candidates].sort((a, b) => rankingEvidence(question, b) - rankingEvidence(question, a));
}

function hybridRowToCandidate(row: HybridTextCandidateRow): PartCandidate {
  const score = Math.max(0, Math.min(1, Number(row.score) || 0));
  return {
    id: row.id,
    documentId: row.documentId,
    filename: row.filename,
    manufacturer: row.manufacturer,
    model: row.model,
    normalizedModel: row.normalizedModel,
    pnc: row.pnc || row.documentPnc,
    normalizedPnc: row.normalizedPnc || normalizeIdentifier(row.documentPnc) || null,
    universalAcrossPnc: row.documentPnc ? false : row.universalAcrossPnc,
    section: row.section,
    position: row.position,
    name: row.name,
    alternativeNames: row.alternativeNames,
    partNumber: row.partNumber,
    normalizedPartNumber: row.normalizedPartNumber,
    page: row.page,
    notes: row.notes,
    distance: row.source === 'FULL_TEXT' ? Math.max(0.16, 0.58 - score * 0.35) : Math.max(0.22, 0.72 - score * 0.46),
    feedbackScore: 0,
    searchMethod: 'LEXICAL',
    retrievalSources: [row.source],
    retrievalAgreement: 1,
  };
}

function mergeRetrieverResults(rankings: PartCandidate[][]): PartCandidate[] {
  const activeRankings = rankings.filter(ranking => ranking.length > 0);
  if (!activeRankings.length) return [];
  const fusionScores = normalizedReciprocalRankFusionScores(activeRankings);
  const byId = new Map<string, PartCandidate>();

  for (const candidate of activeRankings.flat()) {
    const current = byId.get(candidate.id);
    if (!current) {
      byId.set(candidate.id, { ...candidate, retrievalSources: [...candidateSources(candidate)] });
      continue;
    }
    const sources = [...new Set([...candidateSources(current), ...candidateSources(candidate)])];
    const preferred = (candidate.feedbackScore > current.feedbackScore || candidate.distance < current.distance) ? candidate : current;
    byId.set(candidate.id, {
      ...preferred,
      retrievalSources: sources,
      retrievalAgreement: sources.length,
    });
  }

  return [...byId.values()].map(candidate => ({
    ...candidate,
    retrievalScore: fusionScores.get(candidate.id) || 0,
    retrievalAgreement: new Set(candidateSources(candidate)).size,
  }));
}

export class PartSearchService {
  static async byId(tenantId: string, partId: string): Promise<PartCandidate | null> {
    const part = await prisma.part.findFirst({
      where: { id: partId, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
      include: { document: { select: { filename: true, pnc: true } } },
    });
    if (!part) return null;
    return {
      id: part.id, documentId: part.documentId, filename: part.document.filename,
      manufacturer: part.manufacturer, model: part.model, normalizedModel: part.normalizedModel,
      pnc: part.pnc || part.document.pnc,
      normalizedPnc: part.normalizedPnc || normalizeIdentifier(part.document.pnc) || null,
      universalAcrossPnc: part.document.pnc ? false : part.universalAcrossPnc,
      section: part.section, position: part.position, name: part.name, alternativeNames: part.alternativeNames,
      partNumber: part.partNumber, normalizedPartNumber: part.normalizedPartNumber,
      page: part.page, notes: part.notes, distance: 0, feedbackScore: 0, searchMethod: 'LEXICAL',
      retrievalSources: ['LEXICAL'], retrievalAgreement: 1,
    };
  }

  static async directByCode(tenantId: string, partNumber: string): Promise<PartCandidate[]> {
    const needle = normalizeIdentifier(resolveCurrentPartNumber(partNumber));
    if (!needle) return [];
    const rows = await prisma.part.findMany({
      where: { normalizedPartNumber: needle, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
      include: { document: { select: { filename: true, pnc: true } } },
    });
    return preferCurrentPartNumbers(deduplicatePartCandidates(rows.map(p => ({
      id: p.id, documentId: p.documentId, filename: p.document.filename,
      manufacturer: p.manufacturer, model: p.model, normalizedModel: p.normalizedModel,
      pnc: p.pnc || p.document.pnc,
      normalizedPnc: p.normalizedPnc || normalizeIdentifier(p.document.pnc) || null,
      universalAcrossPnc: p.document.pnc ? false : p.universalAcrossPnc,
      section: p.section, position: p.position, name: p.name, alternativeNames: p.alternativeNames,
      partNumber: p.partNumber, normalizedPartNumber: p.normalizedPartNumber,
      page: p.page, notes: p.notes, distance: 0, feedbackScore: 0, searchMethod: 'DIRECT_CODE' as const,
      retrievalSources: ['DIRECT_CODE'] as RetrievalSource[], retrievalAgreement: 1,
    }))));
  }

  static async availablePncs(tenantId: string, normalizedModel: string): Promise<string[]> {
    const rows = await prisma.part.findMany({
      where: { normalizedModel, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
      select: { pnc: true, document: { select: { pnc: true } } },
    });
    return [...new Set(rows.map(r => r.pnc || r.document.pnc).filter((value): value is string => Boolean(value)))];
  }

  static async similarModels(tenantId: string, requested: string): Promise<string[]> {
    const rows = await prisma.part.findMany({
      where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
      select: { model: true, normalizedModel: true }, distinct: ['normalizedModel'], take: 300,
    });
    return rows
      .filter(row => row.normalizedModel.includes(requested) || requested.includes(row.normalizedModel))
      .slice(0, 8)
      .map(row => row.model);
  }

  static async semantic(tenantId: string, question: string, intent: SearchIntent): Promise<PartCandidate[]> {
    const lexicalPromise = this.lexical(tenantId, question, intent);
    const fullTextPromise = fullTextPartCandidates(tenantId, question, intent).catch(error => {
      console.warn('⚠️ Full-text search indisponível; usando os demais recuperadores.', error instanceof Error ? error.message : error);
      return [];
    });
    const fuzzyPromise = fuzzyPartCandidates(tenantId, question, intent).catch(error => {
      console.warn('⚠️ Busca fuzzy indisponível; usando os demais recuperadores.', error instanceof Error ? error.message : error);
      return [];
    });

    const [localCandidates, fullTextRows, fuzzyRows] = await Promise.all([lexicalPromise, fullTextPromise, fuzzyPromise]);
    const ftsCandidates = fullTextRows.map(hybridRowToCandidate);
    const fuzzyCandidates = fuzzyRows.map(hybridRowToCandidate);
    const model = normalizeIdentifier(intent.model);
    const manufacturer = normalizeIdentifier(intent.manufacturer);
    const pnc = normalizeIdentifier(intent.pnc);

    for (const group of [ftsCandidates, fuzzyCandidates]) {
      if (!group.length) continue;
      try { await this.applyFeedback(tenantId, question, model, pnc, group); }
      catch (error) { console.warn('⚠️ Feedback indisponível no recuperador híbrido.', error instanceof Error ? error.message : error); }
    }

    const semanticCandidates = await this.semanticVector(tenantId, question, intent).catch(error => {
      console.warn('⚠️ Recuperação vetorial indisponível; mantendo busca textual/fuzzy.', error instanceof Error ? error.message : error);
      return [];
    });

    const combined = mergeRetrieverResults([semanticCandidates, localCandidates, ftsCandidates, fuzzyCandidates]);
    if (!combined.length) return [];
    const focused = focusCandidatesByDescription(intent.partDescription || question, combined);
    const deduplicated = deduplicatePartCandidates(focused);
    return preferCurrentPartNumbers(rankCandidatesForQuestion(question, deduplicated)).slice(0, 40);
  }

  private static async semanticVector(tenantId: string, question: string, intent: SearchIntent): Promise<PartCandidate[]> {
    const model = normalizeIdentifier(intent.model);
    const manufacturer = normalizeIdentifier(intent.manufacturer);
    const pnc = normalizeIdentifier(intent.pnc);
    const availabilityFilters: Prisma.PartWhereInput[] = [];
    if (manufacturer) availabilityFilters.push({ OR: [{ normalizedManufacturer: manufacturer }, { normalizedManufacturer: null }] });
    if (pnc) availabilityFilters.push({ OR: [{ normalizedPnc: pnc }, { universalAcrossPnc: true }] });

    const hasSemanticIndex = await prisma.part.findFirst({
      where: {
        active: true,
        embeddingRevision: { gt: 0 },
        document: { tenantId, archivedAt: null, status: 'COMPLETED' },
        ...(model ? { normalizedModel: model } : {}),
        ...(availabilityFilters.length ? { AND: availabilityFilters } : {}),
      },
      select: { id: true },
    });
    if (!hasSemanticIndex) return [];

    const expanded = semanticQueryText(intent.partDescription || question, [intent.manufacturer, intent.model, intent.pnc]);
    const queryText = [expanded, intent.section, intent.position].filter(Boolean).join(' | ');
    const ai = await getGeminiClient();
    const embed = await ai.models.embedContent({
      model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
      contents: queryText,
      config: { outputDimensionality: 768, taskType: 'RETRIEVAL_QUERY' },
    });
    const vector = embed.embeddings?.[0]?.values;
    if (!vector || vector.length !== 768) return [];
    const vectorString = `[${vector.join(',')}]`;

    const filters: Prisma.Sql[] = [
      Prisma.sql`d."tenantId" = ${tenantId}`,
      Prisma.sql`d."status" = 'COMPLETED'`,
      Prisma.sql`d."archivedAt" IS NULL`,
      Prisma.sql`p."active" = true`,
      Prisma.sql`p."embedding" IS NOT NULL`,
    ];
    if (model) filters.push(Prisma.sql`p."normalizedModel" = ${model}`);
    if (manufacturer) filters.push(Prisma.sql`(p."normalizedManufacturer" = ${manufacturer} OR p."normalizedManufacturer" IS NULL)`);
    if (pnc) filters.push(Prisma.sql`(p."normalizedPnc" = ${pnc} OR p."universalAcrossPnc" = true)`);

    type Raw = Omit<PartCandidate, 'feedbackScore' | 'searchMethod' | 'retrievalScore' | 'retrievalSources' | 'retrievalAgreement'> & { documentPnc: string | null };
    const rows = await prisma.$queryRaw<Raw[]>(Prisma.sql`
      SELECT p."id", p."documentId", d."filename", p."manufacturer", p."model", p."normalizedModel",
             p."pnc", p."normalizedPnc", p."universalAcrossPnc", p."section", p."position", p."name",
             p."alternativeNames", p."partNumber", p."normalizedPartNumber", p."page", p."notes",
             d."pnc" AS "documentPnc", (p."embedding" <=> ${vectorString}::vector) AS "distance"
      FROM "Part" p INNER JOIN "Document" d ON d."id" = p."documentId"
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY p."embedding" <=> ${vectorString}::vector
      LIMIT 50
    `);

    const candidates: PartCandidate[] = rows.map<PartCandidate>(row => {
      const { documentPnc, ...candidate } = row;
      return {
        ...candidate,
        pnc: candidate.pnc || documentPnc,
        normalizedPnc: candidate.normalizedPnc || normalizeIdentifier(documentPnc) || null,
        universalAcrossPnc: documentPnc ? false : candidate.universalAcrossPnc,
        distance: Number(candidate.distance), feedbackScore: 0, searchMethod: 'SEMANTIC' as const,
        retrievalSources: ['SEMANTIC'] as RetrievalSource[], retrievalAgreement: 1,
      };
    }).filter(candidate => candidate.distance <= MAX_DISTANCE);

    if (candidates.length) await this.applyFeedback(tenantId, question, model, pnc, candidates);
    return candidates;
  }

  private static async lexical(tenantId: string, question: string, intent: SearchIntent): Promise<PartCandidate[]> {
    const query = intent.partDescription || question;
    const normalizedModel = normalizeIdentifier(intent.model);
    const normalizedManufacturer = normalizeIdentifier(intent.manufacturer);
    const normalizedPnc = normalizeIdentifier(intent.pnc);
    const groups = buildSearchGroups(query, [intent.manufacturer, intent.model, intent.pnc]);
    if (!groups.length) return [];

    const groupFilters: Prisma.PartWhereInput[] = groups.map(group => ({
      OR: group.variants.flatMap(variant => [
        { normalizedName: { contains: variant } },
        { searchText: { contains: variant, mode: 'insensitive' as const } },
      ]),
    }));
    const contextFilters: Prisma.PartWhereInput[] = [];
    if (normalizedManufacturer) contextFilters.push({ OR: [{ normalizedManufacturer }, { normalizedManufacturer: null }] });
    if (normalizedPnc) contextFilters.push({ OR: [{ normalizedPnc }, { universalAcrossPnc: true }] });

    const baseWhere: Prisma.PartWhereInput = {
      active: true,
      document: { tenantId, archivedAt: null, status: 'COMPLETED' },
      ...(normalizedModel ? { normalizedModel } : {}),
    };
    let rows = await prisma.part.findMany({
      where: { ...baseWhere, AND: [...groupFilters, ...contextFilters] },
      include: { document: { select: { filename: true, pnc: true } } },
      take: 120,
    });

    if (!rows.length && groups.length > 1) {
      const broadVariants = [...new Set(groups.flatMap(group => group.variants))];
      rows = await prisma.part.findMany({
        where: {
          ...baseWhere,
          ...(contextFilters.length ? { AND: contextFilters } : {}),
          OR: broadVariants.flatMap(variant => [
            { normalizedName: { contains: variant } },
            { searchText: { contains: variant, mode: 'insensitive' as const } },
          ]),
        },
        include: { document: { select: { filename: true, pnc: true } } },
        take: 160,
      });
    }

    const candidates: PartCandidate[] = rows.map(part => {
      const score = scorePartText(query, { name: part.name, section: part.section, aliases: part.alternativeNames, notes: part.notes });
      return {
        id: part.id, documentId: part.documentId, filename: part.document.filename,
        manufacturer: part.manufacturer, model: part.model, normalizedModel: part.normalizedModel,
        pnc: part.pnc || part.document.pnc,
        normalizedPnc: part.normalizedPnc || normalizeIdentifier(part.document.pnc) || null,
        universalAcrossPnc: part.document.pnc ? false : part.universalAcrossPnc,
        section: part.section, position: part.position, name: part.name, alternativeNames: part.alternativeNames,
        partNumber: part.partNumber, normalizedPartNumber: part.normalizedPartNumber,
        page: part.page, notes: part.notes,
        distance: Math.max(0.2, 0.62 - score * 0.42), feedbackScore: 0, searchMethod: 'LEXICAL',
        retrievalSources: ['LEXICAL'], retrievalAgreement: 1,
      };
    });
    if (candidates.length) await this.applyFeedback(tenantId, question, normalizedModel, normalizedPnc, candidates);
    return preferCurrentPartNumbers(rankCandidatesForQuestion(question, deduplicatePartCandidates(candidates))).slice(0, 50);
  }

  private static async applyFeedback(tenantId: string, question: string, model: string, pnc: string, candidates: PartCandidate[]): Promise<void> {
    const contextFilters: Prisma.SearchFeedbackWhereInput[] = [];
    if (model) contextFilters.push({ OR: [{ normalizedModel: model }, { normalizedModel: null }] });
    if (pnc) contextFilters.push({ OR: [{ normalizedPnc: pnc }, { normalizedPnc: null }] });
    const rows = await prisma.searchFeedback.findMany({
      where: { tenantId, ...(contextFilters.length ? { AND: contextFilters } : {}) },
      select: {
        resultPartId: true, correctedPartId: true, correct: true,
        normalizedQuery: true, normalizedModel: true, normalizedPnc: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 300,
    });
    applyFeedbackLearning(question, candidates, rows);
  }
}
