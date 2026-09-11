import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { GEMINI_EMBEDDING_MODEL, getGeminiClient } from '../config/gemini';
import { withTransientAIRetry } from '../utils/ai-retry';

const prisma = new PrismaClient();
const DEFAULT_PARTS_PER_DOCUMENT = 120;
const DEFAULT_CHUNKS_PER_DOCUMENT = 24;

type PendingVectorRow = {
  id: string;
  text: string;
  revision: number;
};

type CoverageRow = {
  documents: bigint;
  documentsCovered: bigint;
  parts: bigint;
  partsEmbedded: bigint;
  chunks: bigint;
  chunksEmbedded: bigint;
  targetParts: bigint;
  targetChunks: bigint;
};

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find(arg => arg.startsWith(prefix))?.slice(prefix.length).trim();
}

function boundedOption(name: string, fallback: number, minimum: number, maximum: number): number {
  const parsed = Number(option(name) || fallback);
  return Number.isFinite(parsed) ? Math.max(minimum, Math.min(maximum, Math.trunc(parsed))) : fallback;
}

function batchSize(): number {
  return boundedOption('batch', 80, 1, 100);
}

function partsPerDocument(): number {
  return boundedOption('parts-per-document', DEFAULT_PARTS_PER_DOCUMENT, 0, 500);
}

function chunksPerDocument(): number {
  return boundedOption('chunks-per-document', DEFAULT_CHUNKS_PER_DOCUMENT, 0, 120);
}

async function resolveTenant() {
  const tenantId = option('tenant');
  const tenantName = option('tenant-name');

  if (tenantId) {
    const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true, name: true } });
    if (!tenant) throw new Error(`Tenant ${tenantId} não encontrado.`);
    return tenant;
  }

  if (tenantName) {
    const tenants = await prisma.tenant.findMany({ where: { name: tenantName }, select: { id: true, name: true } });
    if (tenants.length !== 1) throw new Error(`Esperava 1 tenant chamado "${tenantName}", encontrei ${tenants.length}.`);
    return tenants[0];
  }

  throw new Error('Informe --tenant=UUID ou --tenant-name="Nome".');
}

async function coverage(tenantId: string, partBudget: number, chunkBudget: number): Promise<CoverageRow> {
  const rows = await prisma.$queryRaw<CoverageRow[]>(Prisma.sql`
    WITH docs AS (
      SELECT d."id"
      FROM "Document" d
      WHERE d."tenantId" = ${tenantId}
        AND d."status" = 'COMPLETED'
        AND d."archivedAt" IS NULL
    ),
    part_counts AS (
      SELECT d."id",
             COUNT(p."id")::bigint AS total,
             COUNT(p."id") FILTER (
               WHERE p."embedding" IS NOT NULL
                 AND p."embeddingRevision" = p."extractionRevision"
             )::bigint AS embedded
      FROM docs d
      LEFT JOIN "Part" p ON p."documentId" = d."id" AND p."active" = true
      GROUP BY d."id"
    ),
    chunk_counts AS (
      SELECT d."id",
             COUNT(c."id")::bigint AS total,
             COUNT(c."id") FILTER (
               WHERE c."embedding" IS NOT NULL
                 AND c."embeddingRevision" = c."revision"
             )::bigint AS embedded
      FROM docs d
      LEFT JOIN "DocumentChunk" c ON c."documentId" = d."id"
      GROUP BY d."id"
    )
    SELECT
      COUNT(*)::bigint AS documents,
      COUNT(*) FILTER (WHERE pc.embedded > 0)::bigint AS "documentsCovered",
      COALESCE(SUM(pc.total), 0)::bigint AS parts,
      COALESCE(SUM(pc.embedded), 0)::bigint AS "partsEmbedded",
      COALESCE(SUM(cc.total), 0)::bigint AS chunks,
      COALESCE(SUM(cc.embedded), 0)::bigint AS "chunksEmbedded",
      COALESCE(SUM(LEAST(pc.total, ${partBudget}::bigint)), 0)::bigint AS "targetParts",
      COALESCE(SUM(LEAST(cc.total, ${chunkBudget}::bigint)), 0)::bigint AS "targetChunks"
    FROM part_counts pc
    INNER JOIN chunk_counts cc ON cc."id" = pc."id"
  `);

  return rows[0] || {
    documents: 0n,
    documentsCovered: 0n,
    parts: 0n,
    partsEmbedded: 0n,
    chunks: 0n,
    chunksEmbedded: 0n,
    targetParts: 0n,
    targetChunks: 0n,
  };
}

async function pendingParts(tenantId: string, limit: number, perDocument: number): Promise<PendingVectorRow[]> {
  if (perDocument <= 0) return [];

  return prisma.$queryRaw<PendingVectorRow[]>(Prisma.sql`
    WITH docs AS (
      SELECT d."id", d."createdAt"
      FROM "Document" d
      WHERE d."tenantId" = ${tenantId}
        AND d."status" = 'COMPLETED'
        AND d."archivedAt" IS NULL
    ),
    existing AS (
      SELECT p."documentId",
             COUNT(*) FILTER (
               WHERE p."embedding" IS NOT NULL
                 AND p."embeddingRevision" = p."extractionRevision"
             )::int AS embedded
      FROM "Part" p
      INNER JOIN docs d ON d."id" = p."documentId"
      WHERE p."active" = true
      GROUP BY p."documentId"
    ),
    pending AS (
      SELECT
        p."id",
        p."documentId",
        p."searchText" AS text,
        p."extractionRevision" AS revision,
        d."createdAt" AS "documentCreatedAt",
        COALESCE(p."section", '') AS section,
        p."page",
        p."createdAt",
        ROW_NUMBER() OVER (
          PARTITION BY p."documentId", COALESCE(p."section", '')
          ORDER BY p."page" ASC NULLS LAST, p."position" ASC NULLS LAST, p."createdAt" ASC, p."id" ASC
        ) AS "sectionRank"
      FROM "Part" p
      INNER JOIN docs d ON d."id" = p."documentId"
      WHERE p."active" = true
        AND length(trim(p."searchText")) > 1
        AND (p."embedding" IS NULL OR p."embeddingRevision" <> p."extractionRevision")
    ),
    ranked AS (
      SELECT
        pending.*,
        COALESCE(existing.embedded, 0) AS embedded,
        ROW_NUMBER() OVER (
          PARTITION BY pending."documentId"
          ORDER BY pending."sectionRank" ASC, pending.section ASC, pending."page" ASC NULLS LAST, pending."createdAt" ASC, pending."id" ASC
        ) AS "documentRank"
      FROM pending
      LEFT JOIN existing ON existing."documentId" = pending."documentId"
    )
    SELECT "id", text, revision
    FROM ranked
    WHERE "documentRank" <= GREATEST(0, ${perDocument} - embedded)
    ORDER BY "documentRank" ASC, "documentCreatedAt" ASC, "id" ASC
    LIMIT ${limit}
  `);
}

async function pendingChunks(tenantId: string, limit: number, perDocument: number): Promise<PendingVectorRow[]> {
  if (perDocument <= 0) return [];

  return prisma.$queryRaw<PendingVectorRow[]>(Prisma.sql`
    WITH docs AS (
      SELECT d."id", d."createdAt"
      FROM "Document" d
      WHERE d."tenantId" = ${tenantId}
        AND d."status" = 'COMPLETED'
        AND d."archivedAt" IS NULL
    ),
    existing AS (
      SELECT c."documentId",
             COUNT(*) FILTER (
               WHERE c."embedding" IS NOT NULL
                 AND c."embeddingRevision" = c."revision"
             )::int AS embedded
      FROM "DocumentChunk" c
      INNER JOIN docs d ON d."id" = c."documentId"
      GROUP BY c."documentId"
    ),
    pending AS (
      SELECT
        c."id",
        c."documentId",
        c."searchText" AS text,
        c."revision",
        d."createdAt" AS "documentCreatedAt",
        COALESCE(c."section", '') AS section,
        c."page",
        c."createdAt",
        ROW_NUMBER() OVER (
          PARTITION BY c."documentId", COALESCE(c."section", '')
          ORDER BY c."page" ASC NULLS LAST, c."createdAt" ASC, c."id" ASC
        ) AS "sectionRank"
      FROM "DocumentChunk" c
      INNER JOIN docs d ON d."id" = c."documentId"
      WHERE length(trim(c."searchText")) > 1
        AND (c."embedding" IS NULL OR c."embeddingRevision" <> c."revision")
    ),
    ranked AS (
      SELECT
        pending.*,
        COALESCE(existing.embedded, 0) AS embedded,
        ROW_NUMBER() OVER (
          PARTITION BY pending."documentId"
          ORDER BY pending."sectionRank" ASC, pending.section ASC, pending."page" ASC NULLS LAST, pending."createdAt" ASC, pending."id" ASC
        ) AS "documentRank"
      FROM pending
      LEFT JOIN existing ON existing."documentId" = pending."documentId"
    )
    SELECT "id", text, revision
    FROM ranked
    WHERE "documentRank" <= GREATEST(0, ${perDocument} - embedded)
    ORDER BY "documentRank" ASC, "documentCreatedAt" ASC, "id" ASC
    LIMIT ${limit}
  `);
}

async function embedRows(table: 'Part' | 'DocumentChunk', rows: PendingVectorRow[]): Promise<number> {
  if (!rows.length) return 0;
  const ai = await getGeminiClient();
  const result = await withTransientAIRetry(
    () => ai.models.embedContent({
      model: GEMINI_EMBEDDING_MODEL,
      contents: rows.map(row => row.text),
      config: { outputDimensionality: 768, taskType: 'RETRIEVAL_DOCUMENT' },
    }),
    { label: `backfill semântico ${table} (${rows.length})` },
  );

  const embeddings = result.embeddings || [];
  if (embeddings.length !== rows.length) {
    throw new Error(`A IA retornou ${embeddings.length} embeddings para ${rows.length} registros de ${table}.`);
  }

  const values = rows.map((row, index) => {
    const vectorValues = embeddings[index]?.values;
    if (!vectorValues || vectorValues.length !== 768) throw new Error(`Embedding inválido para ${table} ${row.id}.`);
    const vector = `[${vectorValues.join(',')}]`;
    return Prisma.sql`(${row.id}::text, ${vector}::vector, ${row.revision}::int)`;
  });

  if (table === 'Part') {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "Part" AS target
      SET "embedding" = source.embedding,
          "embeddingRevision" = source.revision
      FROM (VALUES ${Prisma.join(values, ', ')}) AS source(id, embedding, revision)
      WHERE target."id" = source.id
        AND target."active" = true
    `);
  } else {
    await prisma.$executeRaw(Prisma.sql`
      UPDATE "DocumentChunk" AS target
      SET "embedding" = source.embedding,
          "embeddingRevision" = source.revision
      FROM (VALUES ${Prisma.join(values, ', ')}) AS source(id, embedding, revision)
      WHERE target."id" = source.id
    `);
  }

  return rows.length;
}

function printCoverage(label: string, value: CoverageRow) {
  console.log(`\n${label}`);
  console.log(`  Catálogos ativos: ${value.documents.toString()}`);
  console.log(`  Catálogos com embedding de peça: ${value.documentsCovered.toString()}/${value.documents.toString()}`);
  console.log(`  Peças técnicas vetorizadas: ${value.partsEmbedded.toString()}/${value.targetParts.toString()} alvo (${value.parts.toString()} peças ativas no total)`);
  console.log(`  Blocos técnicos vetorizados: ${value.chunksEmbedded.toString()}/${value.targetChunks.toString()} alvo (${value.chunks.toString()} blocos no total)`);
}

async function main() {
  const tenant = await resolveTenant();
  const batch = batchSize();
  const partBudget = partsPerDocument();
  const chunkBudget = chunksPerDocument();

  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Modelo de embedding: ${GEMINI_EMBEDDING_MODEL}`);
  console.log(`Lote: ${batch}`);
  console.log(`Limite por catálogo: até ${partBudget} peças + ${chunkBudget} blocos técnicos.`);
  console.log('Estratégia: cobrir todos os PDFs de forma balanceada por seção/página; cadastro comercial permanece textual/indexado.');

  printCoverage('Cobertura antes do backfill:', await coverage(tenant.id, partBudget, chunkBudget));

  let partTotal = 0;
  while (true) {
    const rows = await pendingParts(tenant.id, batch, partBudget);
    if (!rows.length) break;
    partTotal += await embedRows('Part', rows);
    console.log(`Peças técnicas vetorizadas nesta execução: ${partTotal}`);
  }

  let chunkTotal = 0;
  while (true) {
    const rows = await pendingChunks(tenant.id, batch, chunkBudget);
    if (!rows.length) break;
    chunkTotal += await embedRows('DocumentChunk', rows);
    console.log(`Blocos técnicos vetorizados nesta execução: ${chunkTotal}`);
  }

  printCoverage('Cobertura depois do backfill:', await coverage(tenant.id, partBudget, chunkBudget));
  console.log('\nBackfill semântico concluído. O comando é idempotente e pode ser executado novamente.');
}

main()
  .catch(error => {
    console.error('\nFalha no backfill semântico:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
