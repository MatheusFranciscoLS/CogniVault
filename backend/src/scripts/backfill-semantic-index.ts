import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import { GEMINI_EMBEDDING_MODEL, getGeminiClient } from '../config/gemini';
import { withTransientAIRetry } from '../utils/ai-retry';

const prisma = new PrismaClient();

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
};

function option(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find(arg => arg.startsWith(prefix))?.slice(prefix.length).trim();
}

function batchSize(): number {
  const parsed = Number(option('batch') || '80');
  return Number.isFinite(parsed) ? Math.max(1, Math.min(100, Math.trunc(parsed))) : 80;
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

async function coverage(tenantId: string): Promise<CoverageRow> {
  const rows = await prisma.$queryRaw<CoverageRow[]>(Prisma.sql`
    SELECT
      COUNT(DISTINCT d."id")::bigint AS documents,
      COUNT(DISTINCT d."id") FILTER (
        WHERE EXISTS (
          SELECT 1 FROM "Part" pe
          WHERE pe."documentId" = d."id"
            AND pe."active" = true
            AND pe."embedding" IS NOT NULL
            AND pe."embeddingRevision" = pe."extractionRevision"
        )
      )::bigint AS "documentsCovered",
      COUNT(DISTINCT p."id")::bigint AS parts,
      COUNT(DISTINCT p."id") FILTER (
        WHERE p."embedding" IS NOT NULL
          AND p."embeddingRevision" = p."extractionRevision"
      )::bigint AS "partsEmbedded",
      COUNT(DISTINCT c."id")::bigint AS chunks,
      COUNT(DISTINCT c."id") FILTER (
        WHERE c."embedding" IS NOT NULL
          AND c."embeddingRevision" = c."revision"
      )::bigint AS "chunksEmbedded"
    FROM "Document" d
    LEFT JOIN "Part" p ON p."documentId" = d."id" AND p."active" = true
    LEFT JOIN "DocumentChunk" c ON c."documentId" = d."id"
    WHERE d."tenantId" = ${tenantId}
      AND d."status" = 'COMPLETED'
      AND d."archivedAt" IS NULL
  `);
  return rows[0] || {
    documents: 0n,
    documentsCovered: 0n,
    parts: 0n,
    partsEmbedded: 0n,
    chunks: 0n,
    chunksEmbedded: 0n,
  };
}

async function pendingParts(tenantId: string, limit: number): Promise<PendingVectorRow[]> {
  return prisma.$queryRaw<PendingVectorRow[]>(Prisma.sql`
    SELECT p."id", p."searchText" AS text, p."extractionRevision" AS revision
    FROM "Part" p
    INNER JOIN "Document" d ON d."id" = p."documentId"
    WHERE d."tenantId" = ${tenantId}
      AND d."status" = 'COMPLETED'
      AND d."archivedAt" IS NULL
      AND p."active" = true
      AND length(trim(p."searchText")) > 1
      AND (p."embedding" IS NULL OR p."embeddingRevision" <> p."extractionRevision")
    ORDER BY d."createdAt" ASC, p."section" ASC NULLS LAST, p."page" ASC NULLS LAST, p."createdAt" ASC
    LIMIT ${limit}
  `);
}

async function pendingChunks(tenantId: string, limit: number): Promise<PendingVectorRow[]> {
  return prisma.$queryRaw<PendingVectorRow[]>(Prisma.sql`
    SELECT c."id", c."searchText" AS text, c."revision" AS revision
    FROM "DocumentChunk" c
    INNER JOIN "Document" d ON d."id" = c."documentId"
    WHERE d."tenantId" = ${tenantId}
      AND d."status" = 'COMPLETED'
      AND d."archivedAt" IS NULL
      AND length(trim(c."searchText")) > 1
      AND (c."embedding" IS NULL OR c."embeddingRevision" <> c."revision")
    ORDER BY d."createdAt" ASC, c."page" ASC NULLS LAST, c."section" ASC NULLS LAST, c."id" ASC
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
  console.log(`  Peças técnicas: ${value.partsEmbedded.toString()}/${value.parts.toString()}`);
  console.log(`  Blocos técnicos: ${value.chunksEmbedded.toString()}/${value.chunks.toString()}`);
}

async function main() {
  const tenant = await resolveTenant();
  const batch = batchSize();
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);
  console.log(`Modelo de embedding: ${GEMINI_EMBEDDING_MODEL}`);
  console.log(`Lote: ${batch}`);
  console.log('Estratégia: vetorizar toda a base técnica ativa dos PDFs; cadastro comercial permanece textual/indexado.');

  printCoverage('Cobertura antes do backfill:', await coverage(tenant.id));

  let partTotal = 0;
  while (true) {
    const rows = await pendingParts(tenant.id, batch);
    if (!rows.length) break;
    partTotal += await embedRows('Part', rows);
    console.log(`Peças técnicas vetorizadas nesta execução: ${partTotal}`);
  }

  let chunkTotal = 0;
  while (true) {
    const rows = await pendingChunks(tenant.id, batch);
    if (!rows.length) break;
    chunkTotal += await embedRows('DocumentChunk', rows);
    console.log(`Blocos técnicos vetorizados nesta execução: ${chunkTotal}`);
  }

  printCoverage('Cobertura depois do backfill:', await coverage(tenant.id));
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
