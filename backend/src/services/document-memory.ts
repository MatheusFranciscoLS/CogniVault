import { Prisma } from '@prisma/client';
import { prisma } from '../config/prisma';
import { getGeminiClient } from '../config/gemini';
import { normalizeIdentifier, normalizeText } from '../utils/normalize';
import { withTransientAIRetry } from '../utils/ai-retry';

export type MemoryPart = {
  model: string;
  pnc?: string | null;
  universalAcrossPnc?: boolean;
  page?: number | null;
  section?: string | null;
  position?: string | null;
  name: string;
  alternativeNames?: string[];
  notes?: string | null;
};

export type TechnicalMemoryChunk = {
  content: string;
  searchText: string;
  chunkType: 'PARTS_SECTION';
  page: number | null;
  section: string | null;
  model: string | null;
  normalizedModel: string | null;
  pnc: string | null;
  normalizedPnc: string | null;
};

export type TechnicalContextHit = {
  id: string;
  documentId: string;
  filename: string;
  content: string;
  page: number | null;
  section: string | null;
  model: string | null;
  pnc: string | null;
  score: number;
  method: 'FULL_TEXT' | 'FUZZY' | 'SEMANTIC';
};

function clean(value: string | null | undefined): string {
  return (value || '').trim();
}

function groupKey(part: MemoryPart): string {
  const model = normalizeIdentifier(part.model) || '?';
  const pnc = part.universalAcrossPnc ? '*' : (normalizeIdentifier(part.pnc) || '?');
  const page = part.page || 0;
  const section = normalizeText(part.section || 'Sem seção');
  return `${model}|${pnc}|${page}|${section}`;
}

function partLine(part: MemoryPart): string {
  return [
    part.position ? `Posição ${part.position}` : '',
    part.name,
    part.alternativeNames?.length ? `também descrita como ${part.alternativeNames.slice(0, 4).join(', ')}` : '',
    part.notes ? `observação: ${part.notes}` : '',
  ].filter(Boolean).join(' · ');
}

/**
 * Cria memória de arquitetura por página/vista sem copiar o Part Number.
 * O código continua tendo uma única fonte de autoridade: a tabela Part.
 */
export function buildTechnicalMemoryChunks(parts: MemoryPart[], maxItemsPerChunk = 24): TechnicalMemoryChunk[] {
  const groups = new Map<string, MemoryPart[]>();
  for (const part of parts) {
    if (!clean(part.name) || !clean(part.model)) continue;
    const key = groupKey(part);
    const rows = groups.get(key) || [];
    rows.push(part);
    groups.set(key, rows);
  }

  const chunks: TechnicalMemoryChunk[] = [];
  const take = Math.max(5, Math.min(40, Math.trunc(maxItemsPerChunk)));
  for (const rows of groups.values()) {
    const first = rows[0];
    for (let offset = 0; offset < rows.length; offset += take) {
      const batch = rows.slice(offset, offset + take);
      const section = clean(first.section) || null;
      const page = first.page && first.page > 0 ? first.page : null;
      const pnc = first.universalAcrossPnc ? null : (clean(first.pnc) || null);
      const header = [
        `Modelo: ${first.model}`,
        first.universalAcrossPnc ? 'PNC: aplicação indicada como universal no catálogo' : (pnc ? `PNC: ${pnc}` : ''),
        section ? `Seção/vista: ${section}` : '',
        page ? `Página: ${page}` : '',
      ].filter(Boolean).join(' | ');
      const content = `${header}\nComponentes e relações observadas nesta vista:\n${batch.map(partLine).join('\n')}`;
      chunks.push({
        content,
        searchText: normalizeText(`${header} ${batch.map(part => [part.name, part.section, ...(part.alternativeNames || []), part.notes || ''].join(' ')).join(' ')}`),
        chunkType: 'PARTS_SECTION',
        page,
        section,
        model: first.model,
        normalizedModel: normalizeIdentifier(first.model) || null,
        pnc,
        normalizedPnc: normalizeIdentifier(pnc) || null,
      });
    }
  }
  return chunks;
}

function semanticEnabled(): boolean {
  return ['1', 'true', 'yes', 'on'].includes((process.env.ENABLE_SEMANTIC_INDEXING || 'false').trim().toLowerCase());
}

export async function rebuildDocumentMemory(
  documentId: string,
  tenantId: string,
  revision: number,
  parts: MemoryPart[],
): Promise<{ chunks: number; embedded: number }> {
  const document = await prisma.document.findFirst({
    where: { id: documentId, tenantId, archivedAt: null },
    select: { id: true },
  });
  if (!document) throw new Error('DOCUMENT_NOT_FOUND');

  const chunks = buildTechnicalMemoryChunks(parts);
  await prisma.$transaction(async tx => {
    await tx.documentChunk.deleteMany({ where: { documentId } });
    if (chunks.length) {
      await tx.documentChunk.createMany({
        data: chunks.map(chunk => ({ ...chunk, documentId, revision, embeddingRevision: 0 })),
      });
    }
  });
  if (!chunks.length || !semanticEnabled()) return { chunks: chunks.length, embedded: 0 };

  try {
    const rows = await prisma.documentChunk.findMany({
      where: { documentId, revision },
      orderBy: [{ page: 'asc' }, { id: 'asc' }],
      select: { id: true, searchText: true },
    });
    const ai = await getGeminiClient();
    let embedded = 0;
    const batchSize = 40;
    for (let offset = 0; offset < rows.length; offset += batchSize) {
      const batch = rows.slice(offset, offset + batchSize);
      const result = await withTransientAIRetry(
        () => ai.models.embedContent({
          model: process.env.GEMINI_EMBEDDING_MODEL || 'gemini-embedding-001',
          contents: batch.map(row => row.searchText),
          config: { outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT' },
        }),
        { label: `memória técnica ${documentId} ${offset + 1}-${offset + batch.length}` },
      );
      const embeddings = result.embeddings || [];
      if (embeddings.length !== batch.length) throw new Error('Quantidade inválida de embeddings da memória técnica.');
      await prisma.$transaction(async tx => {
        for (const [index, row] of batch.entries()) {
          const values = embeddings[index]?.values;
          if (!values || values.length !== 768) throw new Error('Embedding inválido da memória técnica.');
          const vector = `[${values.join(',')}]`;
          await tx.$executeRaw`
            UPDATE "DocumentChunk"
            SET "embedding" = ${vector}::vector, "embeddingRevision" = ${revision}
            WHERE "id" = ${row.id}
          `;
          embedded += 1;
        }
      });
    }
    return { chunks: chunks.length, embedded };
  } catch (error) {
    console.warn('⚠️ Memória técnica criada sem embeddings opcionais.', error instanceof Error ? error.message : error);
    return { chunks: chunks.length, embedded: 0 };
  }
}

function memoryFilters(tenantId: string, model?: string, pnc?: string, documentId?: string): Prisma.Sql[] {
  const filters: Prisma.Sql[] = [
    Prisma.sql`d."tenantId" = ${tenantId}`,
    Prisma.sql`d."status" = 'COMPLETED'`,
    Prisma.sql`d."archivedAt" IS NULL`,
  ];
  const normalizedModel = normalizeIdentifier(model);
  const normalizedPnc = normalizeIdentifier(pnc);
  if (normalizedModel) filters.push(Prisma.sql`c."normalizedModel" = ${normalizedModel}`);
  if (normalizedPnc) filters.push(Prisma.sql`(c."normalizedPnc" = ${normalizedPnc} OR c."normalizedPnc" IS NULL)`);
  if (documentId) filters.push(Prisma.sql`c."documentId" = ${documentId}`);
  return filters;
}

export async function retrieveTechnicalContext(
  tenantId: string,
  question: string,
  options: { model?: string; pnc?: string; documentId?: string; limit?: number } = {},
): Promise<TechnicalContextHit[]> {
  const query = normalizeText(question).trim();
  if (query.length < 2) return [];
  const filters = memoryFilters(tenantId, options.model, options.pnc, options.documentId);
  const limit = Math.max(1, Math.min(8, options.limit || 4));
  type Raw = Omit<TechnicalContextHit, 'score' | 'method'> & { score: number | string };

  const fullText = await prisma.$queryRaw<Raw[]>(Prisma.sql`
    SELECT c."id", c."documentId", d."filename", c."content", c."page", c."section", c."model", c."pnc",
      ts_rank_cd(
        to_tsvector('simple'::regconfig, COALESCE(c."searchText", '')),
        websearch_to_tsquery('simple'::regconfig, ${query}), 32
      ) AS "score"
    FROM "DocumentChunk" c
    INNER JOIN "Document" d ON d."id" = c."documentId"
    WHERE ${Prisma.join(filters, ' AND ')}
      AND to_tsvector('simple'::regconfig, COALESCE(c."searchText", ''))
        @@ websearch_to_tsquery('simple'::regconfig, ${query})
    ORDER BY "score" DESC
    LIMIT ${limit}
  `);
  if (fullText.length) return fullText.map(row => ({ ...row, score: Number(row.score), method: 'FULL_TEXT' }));

  const fuzzy = await prisma.$queryRaw<Raw[]>(Prisma.sql`
    SELECT c."id", c."documentId", d."filename", c."content", c."page", c."section", c."model", c."pnc",
      word_similarity(lower(${query}), lower(COALESCE(c."searchText", ''))) AS "score"
    FROM "DocumentChunk" c
    INNER JOIN "Document" d ON d."id" = c."documentId"
    WHERE ${Prisma.join(filters, ' AND ')}
      AND lower(${query}) <% lower(COALESCE(c."searchText", ''))
    ORDER BY "score" DESC
    LIMIT ${limit}
  `);
  return fuzzy
    .map(row => ({ ...row, score: Number(row.score), method: 'FUZZY' as const }))
    .filter(row => Number.isFinite(row.score) && row.score >= 0.16);
}
