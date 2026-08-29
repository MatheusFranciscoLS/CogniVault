import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { getGeminiClient } from '../config/gemini';
import { normalizeIdentifier } from '../utils/normalize';
import type { SearchIntent } from './chat-intent.service';
import { buildSearchGroups, hasKnownPartVocabulary, scorePartText } from './part-vocabulary';
import { applyFeedbackLearning } from './feedback-learning';
import { preferCurrentPartNumbers, resolveCurrentPartNumber } from './part-supersession';

const MAX_DISTANCE = Number(process.env.PART_SEARCH_MAX_DISTANCE || '0.65');

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
}

export function deduplicatePartCandidates(candidates: PartCandidate[]): PartCandidate[] {
  const byTechnicalIdentity = new Map<string, PartCandidate>();
  for (const candidate of candidates) {
    const pnc = candidate.universalAcrossPnc ? '*' : (candidate.normalizedPnc || '');
    const key = `${candidate.normalizedPartNumber}|${candidate.normalizedModel}|${pnc}`;
    const current = byTechnicalIdentity.get(key);
    const candidateRank = candidate.distance - candidate.feedbackScore;
    const currentRank = current ? current.distance - current.feedbackScore : Number.POSITIVE_INFINITY;
    const candidateHasMoreContext = Boolean(candidate.notes && !current?.notes);
    if (!current || candidateRank < currentRank || (candidateRank === currentRank && candidateHasMoreContext)) {
      byTechnicalIdentity.set(key, candidate);
    }
  }
  return [...byTechnicalIdentity.values()];
}

export class PartSearchService {
  static async byId(tenantId: string, partId: string): Promise<PartCandidate | null> {
    const part = await prisma.part.findFirst({
      where: {
        id: partId,
        active: true,
        document: { tenantId, archivedAt: null, status: 'COMPLETED' },
      },
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
    };
  }

  static async directByCode(tenantId: string, partNumber: string): Promise<PartCandidate[]> {
    const needle = normalizeIdentifier(resolveCurrentPartNumber(partNumber));
    if (!needle) return [];
    const rows = await prisma.part.findMany({
      where: {
        normalizedPartNumber: needle,
        active: true,
        document: { tenantId, archivedAt: null, status: 'COMPLETED' },
      },
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
      page: p.page, notes: p.notes, distance: 0, feedbackScore: 0, searchMethod: 'DIRECT_CODE',
    }))));
  }

  static async availablePncs(tenantId: string, normalizedModel: string): Promise<string[]> {
    const rows = await prisma.part.findMany({
      where: { normalizedModel, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
      select: { pnc: true, document: { select: { pnc: true } } },
    });
    return [...new Set(rows.map(r => r.pnc || r.document.pnc).filter((v): v is string => Boolean(v)))];
  }

  static async similarModels(tenantId: string, requested: string): Promise<string[]> {
    const rows = await prisma.part.findMany({
      where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
      select: { model: true, normalizedModel: true }, distinct: ['normalizedModel'], take: 200,
    });
    return rows.filter(r => r.normalizedModel.includes(requested) || requested.includes(r.normalizedModel)).slice(0, 8).map(r => r.model);
  }

  static async semantic(tenantId: string, question: string, intent: SearchIntent): Promise<PartCandidate[]> {
    if (hasKnownPartVocabulary(question)) {
      const localCandidates = await this.lexical(tenantId, question, intent);
      if (localCandidates.length) return localCandidates;
    }

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
    if (!hasSemanticIndex) return this.lexical(tenantId, question, intent);

    const queryText = [intent.partDescription || question, intent.section, intent.position].filter(Boolean).join(' | ');
    let vector: number[] | undefined;
    try {
      const ai = await getGeminiClient();
      const embed = await ai.models.embedContent({
        model: 'gemini-embedding-001', contents: queryText,
        config: { outputDimensionality: 768, taskType: 'RETRIEVAL_QUERY' },
      });
      vector = embed.embeddings?.[0]?.values;
    } catch (error) {
      console.warn('⚠️ Embedding de consulta indisponível; usando busca textual.', error instanceof Error ? error.message : error);
    }
    if (!vector || vector.length !== 768) return this.lexical(tenantId, question, intent);
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

    type Raw = Omit<PartCandidate, 'feedbackScore' | 'searchMethod'> & { documentPnc: string | null };
    const rows = await prisma.$queryRaw<Raw[]>(Prisma.sql`
      SELECT p."id", p."documentId", d."filename", p."manufacturer", p."model", p."normalizedModel",
             p."pnc", p."normalizedPnc", p."universalAcrossPnc", p."section", p."position", p."name",
             p."alternativeNames", p."partNumber", p."normalizedPartNumber", p."page", p."notes",
             d."pnc" AS "documentPnc",
             (p."embedding" <=> ${vectorString}::vector) AS "distance"
      FROM "Part" p INNER JOIN "Document" d ON d."id" = p."documentId"
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY p."embedding" <=> ${vectorString}::vector
      LIMIT 40
    `);

    const candidates: PartCandidate[] = rows
      .map(row => {
        const { documentPnc, ...r } = row;
        return {
          ...r,
          pnc: r.pnc || documentPnc,
          normalizedPnc: r.normalizedPnc || normalizeIdentifier(documentPnc) || null,
          universalAcrossPnc: documentPnc ? false : r.universalAcrossPnc,
          distance: Number(r.distance), feedbackScore: 0, searchMethod: 'SEMANTIC' as const,
        };
      })
      .filter(r => r.distance <= MAX_DISTANCE);

    if (!candidates.length) return this.lexical(tenantId, question, intent);
    try {
      await this.applyFeedback(tenantId, question, model, pnc, candidates);
    } catch (error) {
      console.warn('⚠️ Aprendizado por feedback indisponível nesta consulta; mantendo ranking técnico.', error instanceof Error ? error.message : error);
    }
    return preferCurrentPartNumbers(deduplicatePartCandidates(candidates.sort((a, b) => (a.distance - a.feedbackScore) - (b.distance - b.feedbackScore))));
  }

  private static async lexical(tenantId: string, question: string, intent: SearchIntent): Promise<PartCandidate[]> {
    const query = intent.partDescription || question;
    const normalizedModel = normalizeIdentifier(intent.model);
    const normalizedManufacturer = normalizeIdentifier(intent.manufacturer);
    const normalizedPnc = normalizeIdentifier(intent.pnc);
    const groups = buildSearchGroups(query, [intent.manufacturer, intent.model, intent.pnc]);
    if (!groups.length) return [];

    const filters: Prisma.PartWhereInput[] = groups.map(group => ({
      OR: group.variants.flatMap(variant => [
        { normalizedName: { contains: variant } },
        { searchText: { contains: variant, mode: 'insensitive' as const } },
      ]),
    }));
    if (normalizedManufacturer) filters.push({ OR: [{ normalizedManufacturer }, { normalizedManufacturer: null }] });
    if (normalizedPnc) filters.push({ OR: [{ normalizedPnc }, { universalAcrossPnc: true }] });

    const rows = await prisma.part.findMany({
      where: {
        active: true,
        document: { tenantId, archivedAt: null, status: 'COMPLETED' },
        ...(normalizedModel ? { normalizedModel } : {}),
        AND: filters,
      },
      include: { document: { select: { filename: true, pnc: true } } },
      take: 80,
    });

    const candidates: PartCandidate[] = rows.map(part => {
      const score = scorePartText(query, { name: part.name, section: part.section, aliases: part.alternativeNames });
      const distance = Math.max(0.2, 0.62 - score * 0.42);
      return {
        id: part.id,
        documentId: part.documentId,
        filename: part.document.filename,
        manufacturer: part.manufacturer,
        model: part.model,
        normalizedModel: part.normalizedModel,
        pnc: part.pnc || part.document.pnc,
        normalizedPnc: part.normalizedPnc || normalizeIdentifier(part.document.pnc) || null,
        universalAcrossPnc: part.document.pnc ? false : part.universalAcrossPnc,
        section: part.section,
        position: part.position,
        name: part.name,
        alternativeNames: part.alternativeNames,
        partNumber: part.partNumber,
        normalizedPartNumber: part.normalizedPartNumber,
        page: part.page,
        notes: part.notes,
        distance,
        feedbackScore: 0,
        searchMethod: 'LEXICAL' as const,
      };
    });
    try {
      await this.applyFeedback(tenantId, question, normalizedModel, normalizedPnc, candidates);
    } catch (error) {
      console.warn('⚠️ Aprendizado por feedback indisponível nesta consulta textual; mantendo ranking técnico.', error instanceof Error ? error.message : error);
    }
    return preferCurrentPartNumbers(deduplicatePartCandidates(candidates.sort((a, b) => (a.distance - a.feedbackScore) - (b.distance - b.feedbackScore)))).slice(0, 40);
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
