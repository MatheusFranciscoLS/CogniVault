import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { getGeminiClient } from '../config/gemini';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import type { SearchIntent } from './chat-intent.service';

const MAX_DISTANCE = Number(process.env.PART_SEARCH_MAX_DISTANCE || '0.65');
const FEEDBACK_DISTANCE = Number(process.env.FEEDBACK_MAX_DISTANCE || '0.28');

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
  distance: number;
  feedbackScore: number;
}

export class PartSearchService {
  static async directByCode(tenantId: string, partNumber: string): Promise<PartCandidate[]> {
    const needle = normalizeIdentifier(partNumber);
    if (!needle) return [];
    const rows = await prisma.part.findMany({
      where: {
        normalizedPartNumber: needle,
        active: true,
        document: { tenantId, archivedAt: null, status: 'COMPLETED' },
      },
      include: { document: { select: { filename: true } } },
    });
    return rows.map(p => ({
      id: p.id, documentId: p.documentId, filename: p.document.filename,
      manufacturer: p.manufacturer, model: p.model, normalizedModel: p.normalizedModel,
      pnc: p.pnc, normalizedPnc: p.normalizedPnc, universalAcrossPnc: p.universalAcrossPnc,
      section: p.section, position: p.position, name: p.name, alternativeNames: p.alternativeNames,
      partNumber: p.partNumber, normalizedPartNumber: p.normalizedPartNumber,
      page: p.page, distance: 0, feedbackScore: 0,
    }));
  }

  static async availablePncs(tenantId: string, normalizedModel: string): Promise<string[]> {
    const rows = await prisma.part.findMany({
      where: { normalizedModel, active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' }, pnc: { not: null } },
      select: { pnc: true }, distinct: ['pnc'],
    });
    return [...new Set(rows.map(r => r.pnc).filter((v): v is string => Boolean(v)))];
  }

  static async similarModels(tenantId: string, requested: string): Promise<string[]> {
    const rows = await prisma.part.findMany({
      where: { active: true, document: { tenantId, archivedAt: null, status: 'COMPLETED' } },
      select: { model: true, normalizedModel: true }, distinct: ['normalizedModel'], take: 200,
    });
    return rows.filter(r => r.normalizedModel.includes(requested) || requested.includes(r.normalizedModel)).slice(0, 8).map(r => r.model);
  }

  static async semantic(tenantId: string, question: string, intent: SearchIntent): Promise<PartCandidate[]> {
    const queryText = [intent.partDescription || question, intent.section, intent.position].filter(Boolean).join(' | ');
    const ai = await getGeminiClient();
    const embed = await ai.models.embedContent({
      model: 'gemini-embedding-001', contents: queryText,
      config: { outputDimensionality: 768, taskType: 'RETRIEVAL_QUERY' },
    });
    const vector = embed.embeddings?.[0]?.values;
    if (!vector || vector.length !== 768) throw new Error('Falha ao gerar embedding da consulta.');
    const vectorString = `[${vector.join(',')}]`;

    const model = normalizeIdentifier(intent.model);
    const manufacturer = normalizeIdentifier(intent.manufacturer);
    const pnc = normalizeIdentifier(intent.pnc);
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

    type Raw = Omit<PartCandidate, 'feedbackScore'>;
    const rows = await prisma.$queryRaw<Raw[]>(Prisma.sql`
      SELECT p."id", p."documentId", d."filename", p."manufacturer", p."model", p."normalizedModel",
             p."pnc", p."normalizedPnc", p."universalAcrossPnc", p."section", p."position", p."name",
             p."alternativeNames", p."partNumber", p."normalizedPartNumber", p."page",
             (p."embedding" <=> ${vectorString}::vector) AS "distance"
      FROM "Part" p INNER JOIN "Document" d ON d."id" = p."documentId"
      WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY p."embedding" <=> ${vectorString}::vector
      LIMIT 40
    `);

    const candidates: PartCandidate[] = rows
      .map(r => ({ ...r, distance: Number(r.distance), feedbackScore: 0 }))
      .filter(r => r.distance <= MAX_DISTANCE);

    if (!candidates.length) return [];
    await this.applyFeedback(tenantId, question, vectorString, model, pnc, candidates);
    return candidates.sort((a, b) => (a.distance - a.feedbackScore) - (b.distance - b.feedbackScore));
  }

  private static async applyFeedback(tenantId: string, question: string, vectorString: string, model: string, pnc: string, candidates: PartCandidate[]): Promise<void> {
    type Row = { resultPartId: string; correctedPartId: string | null; correct: boolean; normalizedQuery: string; distance: number };
    const filters: Prisma.Sql[] = [
      Prisma.sql`sf."tenantId" = ${tenantId}`,
      Prisma.sql`sf."queryEmbedding" IS NOT NULL`,
      Prisma.sql`(sf."queryEmbedding" <=> ${vectorString}::vector) <= ${FEEDBACK_DISTANCE}`,
    ];
    if (model) filters.push(Prisma.sql`(sf."normalizedModel" = ${model} OR sf."normalizedModel" IS NULL)`);
    if (pnc) filters.push(Prisma.sql`(sf."normalizedPnc" = ${pnc} OR sf."normalizedPnc" IS NULL)`);

    const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
      SELECT sf."resultPartId", sf."correctedPartId", sf."correct", sf."normalizedQuery",
             (sf."queryEmbedding" <=> ${vectorString}::vector) AS "distance"
      FROM "SearchFeedback" sf WHERE ${Prisma.join(filters, ' AND ')}
      ORDER BY sf."queryEmbedding" <=> ${vectorString}::vector LIMIT 100
    `);
    const exact = normalizeText(question);
    const byId = new Map(candidates.map(c => [c.id, c]));
    for (const row of rows) {
      const similarity = Math.max(0, 1 - Number(row.distance));
      const mult = row.normalizedQuery === exact ? 1.5 : 1;
      const result = byId.get(row.resultPartId);
      if (result) result.feedbackScore += (row.correct ? 0.18 : -0.20) * similarity * mult;
      if (!row.correct && row.correctedPartId) {
        const corrected = byId.get(row.correctedPartId);
        if (corrected) corrected.feedbackScore += 0.26 * similarity * mult;
      }
    }
  }
}
