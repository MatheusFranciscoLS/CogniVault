import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import type { SearchIntent } from './chat-intent.service';
import { lexicalTerms } from './part-vocabulary';

export type HybridTextSource = 'FULL_TEXT' | 'FUZZY';

export interface HybridTextCandidateRow {
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
  documentPnc: string | null;
  score: number;
  source: HybridTextSource;
}

export function meaningfulHybridQuery(question: string, intent: SearchIntent): string {
  const terms = lexicalTerms(intent.partDescription || question, [
    intent.manufacturer,
    intent.model,
    intent.pnc,
    intent.partNumber,
  ]);
  if (terms.length) return terms.join(' ');
  return normalizeText(intent.partDescription || question).trim();
}

function contextFilters(tenantId: string, intent: SearchIntent): Prisma.Sql[] {
  const model = normalizeIdentifier(intent.model);
  const manufacturer = normalizeIdentifier(intent.manufacturer);
  const pnc = normalizeIdentifier(intent.pnc);
  const filters: Prisma.Sql[] = [
    Prisma.sql`d."tenantId" = ${tenantId}`,
    Prisma.sql`d."status" = 'COMPLETED'`,
    Prisma.sql`d."archivedAt" IS NULL`,
    Prisma.sql`p."active" = true`,
  ];
  if (model) filters.push(Prisma.sql`p."normalizedModel" = ${model}`);
  if (manufacturer) filters.push(Prisma.sql`(p."normalizedManufacturer" = ${manufacturer} OR p."normalizedManufacturer" IS NULL)`);
  if (pnc) filters.push(Prisma.sql`(p."normalizedPnc" = ${pnc} OR p."universalAcrossPnc" = true)`);
  return filters;
}

const PART_SELECT = Prisma.sql`
  p."id", p."documentId", d."filename", p."manufacturer", p."model", p."normalizedModel",
  p."pnc", p."normalizedPnc", p."universalAcrossPnc", p."section", p."position", p."name",
  p."alternativeNames", p."partNumber", p."normalizedPartNumber", p."page", p."notes",
  d."pnc" AS "documentPnc"
`;

/**
 * Recuperador textual de alta precisão. O GIN de FTS encontra os termos técnicos
 * no contexto enriquecido da peça e ts_rank_cd favorece ocorrências próximas.
 */
export async function fullTextPartCandidates(
  tenantId: string,
  question: string,
  intent: SearchIntent,
  limit = 50,
): Promise<HybridTextCandidateRow[]> {
  const query = meaningfulHybridQuery(question, intent);
  if (query.length < 2) return [];
  const filters = contextFilters(tenantId, intent);
  const take = Math.max(1, Math.min(80, Math.trunc(limit)));

  type Raw = Omit<HybridTextCandidateRow, 'score' | 'source'> & { score: number | string };
  const rows = await prisma.$queryRaw<Raw[]>(Prisma.sql`
    SELECT ${PART_SELECT},
      ts_rank_cd(
        to_tsvector('simple'::regconfig, COALESCE(p."searchText", '')),
        websearch_to_tsquery('simple'::regconfig, ${query}),
        32
      ) AS "score"
    FROM "Part" p
    INNER JOIN "Document" d ON d."id" = p."documentId"
    WHERE ${Prisma.join(filters, ' AND ')}
      AND to_tsvector('simple'::regconfig, COALESCE(p."searchText", ''))
          @@ websearch_to_tsquery('simple'::regconfig, ${query})
    ORDER BY "score" DESC, p."name" ASC
    LIMIT ${take}
  `);

  return rows.map(row => ({ ...row, score: Number(row.score), source: 'FULL_TEXT' }));
}

/**
 * Recuperador tolerante a erro de digitação. pg_trgm só amplia candidatos dentro
 * do mesmo tenant/modelo/PNC já filtrado; ele nunca cria uma compatibilidade nova.
 */
export async function fuzzyPartCandidates(
  tenantId: string,
  question: string,
  intent: SearchIntent,
  limit = 50,
): Promise<HybridTextCandidateRow[]> {
  const query = meaningfulHybridQuery(question, intent);
  if (query.length < 3) return [];
  const normalizedQuery = normalizeText(query);
  const filters = contextFilters(tenantId, intent);
  const take = Math.max(1, Math.min(80, Math.trunc(limit)));

  type Raw = Omit<HybridTextCandidateRow, 'score' | 'source'> & { score: number | string };
  const rows = await prisma.$queryRaw<Raw[]>(Prisma.sql`
    SELECT ${PART_SELECT},
      GREATEST(
        word_similarity(lower(${query}), lower(COALESCE(p."searchText", ''))),
        similarity(p."normalizedName", ${normalizedQuery})
      ) AS "score"
    FROM "Part" p
    INNER JOIN "Document" d ON d."id" = p."documentId"
    WHERE ${Prisma.join(filters, ' AND ')}
      AND (
        lower(${query}) <% lower(COALESCE(p."searchText", ''))
        OR p."normalizedName" % ${normalizedQuery}
      )
    ORDER BY "score" DESC, p."name" ASC
    LIMIT ${take}
  `);

  return rows
    .map(row => ({ ...row, score: Number(row.score), source: 'FUZZY' as const }))
    .filter(row => Number.isFinite(row.score) && row.score >= 0.18);
}
