-- CogniVault AI Reliability v2
-- Additive migration: no existing rows or columns are removed.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$ BEGIN
    CREATE TYPE "CatalogReviewStatus" AS ENUM ('PENDING', 'READY', 'NEEDS_REVIEW', 'REVIEWED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "Document"
    ADD COLUMN IF NOT EXISTS "healthScore" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "reviewStatus" "CatalogReviewStatus" NOT NULL DEFAULT 'PENDING',
    ADD COLUMN IF NOT EXISTS "reviewReasons" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN IF NOT EXISTS "qualityCheckedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "metadataReviewedAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "metadataReviewedById" TEXT;

ALTER TABLE "DocumentChunk"
    ADD COLUMN IF NOT EXISTS "searchText" TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS "chunkType" TEXT NOT NULL DEFAULT 'TECHNICAL_CONTEXT',
    ADD COLUMN IF NOT EXISTS "page" INTEGER,
    ADD COLUMN IF NOT EXISTS "section" TEXT,
    ADD COLUMN IF NOT EXISTS "model" TEXT,
    ADD COLUMN IF NOT EXISTS "normalizedModel" TEXT,
    ADD COLUMN IF NOT EXISTS "pnc" TEXT,
    ADD COLUMN IF NOT EXISTS "normalizedPnc" TEXT,
    ADD COLUMN IF NOT EXISTS "revision" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "embeddingRevision" INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "AiBenchmarkRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "caseCount" INTEGER NOT NULL,
    "metrics" JSONB NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AiBenchmarkRun_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
    ALTER TABLE "Document"
        ADD CONSTRAINT "Document_metadataReviewedById_fkey"
        FOREIGN KEY ("metadataReviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "AiBenchmarkRun"
        ADD CONSTRAINT "AiBenchmarkRun_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "AiBenchmarkRun"
        ADD CONSTRAINT "AiBenchmarkRun_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE INDEX IF NOT EXISTS "Document_tenantId_reviewStatus_idx" ON "Document"("tenantId", "reviewStatus");
CREATE INDEX IF NOT EXISTS "Document_metadataReviewedById_idx" ON "Document"("metadataReviewedById");
CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_revision_idx" ON "DocumentChunk"("documentId", "revision");
CREATE INDEX IF NOT EXISTS "DocumentChunk_normalizedModel_normalizedPnc_idx" ON "DocumentChunk"("normalizedModel", "normalizedPnc");
CREATE INDEX IF NOT EXISTS "DocumentChunk_page_idx" ON "DocumentChunk"("page");
CREATE INDEX IF NOT EXISTS "AiBenchmarkRun_tenantId_createdAt_idx" ON "AiBenchmarkRun"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiBenchmarkRun_userId_createdAt_idx" ON "AiBenchmarkRun"("userId", "createdAt");

-- Full-text search uses the simple configuration because the indexed catalog text
-- intentionally mixes Portuguese, English, Husqvarna abbreviations and part codes.
CREATE INDEX IF NOT EXISTS "Part_searchText_fts_idx"
    ON "Part" USING GIN (to_tsvector('simple'::regconfig, COALESCE("searchText", '')));
CREATE INDEX IF NOT EXISTS "Part_searchText_trgm_idx"
    ON "Part" USING GIN (lower("searchText") gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Part_normalizedName_trgm_idx"
    ON "Part" USING GIN ("normalizedName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "DocumentChunk_searchText_fts_idx"
    ON "DocumentChunk" USING GIN (to_tsvector('simple'::regconfig, COALESCE("searchText", '')));
CREATE INDEX IF NOT EXISTS "DocumentChunk_searchText_trgm_idx"
    ON "DocumentChunk" USING GIN (lower("searchText") gin_trgm_ops);
