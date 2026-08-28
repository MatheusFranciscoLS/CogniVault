-- Processamento resiliente de catálogos.
-- Migration exclusivamente aditiva: nenhum documento ou peça é removido.

ALTER TABLE "Document"
    ADD COLUMN IF NOT EXISTS "contentHash" TEXT,
    ADD COLUMN IF NOT EXISTS "processingJobId" TEXT,
    ADD COLUMN IF NOT EXISTS "processingStage" TEXT NOT NULL DEFAULT 'IDLE',
    ADD COLUMN IF NOT EXISTS "processingCurrent" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "processingTotal" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "processingError" TEXT,
    ADD COLUMN IF NOT EXISTS "extractionSnapshot" JSONB,
    ADD COLUMN IF NOT EXISTS "extractionMethod" TEXT,
    ADD COLUMN IF NOT EXISTS "extractedAt" TIMESTAMP(3);

ALTER TABLE "Part"
    ADD COLUMN IF NOT EXISTS "embeddingRevision" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "Document_tenantId_contentHash_idx"
    ON "Document"("tenantId", "contentHash");

CREATE INDEX IF NOT EXISTS "Document_processingJobId_idx"
    ON "Document"("processingJobId");
