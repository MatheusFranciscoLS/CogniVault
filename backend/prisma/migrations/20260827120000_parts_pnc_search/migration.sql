CREATE EXTENSION IF NOT EXISTS vector;

ALTER TABLE "Document"
    ADD COLUMN IF NOT EXISTS "manufacturer" TEXT,
    ADD COLUMN IF NOT EXISTS "model" TEXT,
    ADD COLUMN IF NOT EXISTS "storagePath" TEXT,
    ADD COLUMN IF NOT EXISTS "pnc" TEXT;

CREATE TABLE IF NOT EXISTS "Part" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "manufacturer" TEXT,
    "normalizedManufacturer" TEXT,
    "model" TEXT NOT NULL,
    "normalizedModel" TEXT NOT NULL,
    "pnc" TEXT,
    "normalizedPnc" TEXT,
    "universalAcrossPnc" BOOLEAN NOT NULL DEFAULT false,
    "section" TEXT,
    "position" TEXT,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "alternativeNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "partNumber" TEXT NOT NULL,
    "page" INTEGER,
    "notes" TEXT,
    "searchText" TEXT NOT NULL,
    "embedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Part_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Part_documentId_fkey"
        FOREIGN KEY ("documentId") REFERENCES "Document"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Document_tenantId_model_pnc_idx"
    ON "Document"("tenantId", "model", "pnc");

CREATE INDEX IF NOT EXISTS "Document_tenantId_status_idx"
    ON "Document"("tenantId", "status");

CREATE INDEX IF NOT EXISTS "Part_documentId_idx"
    ON "Part"("documentId");

CREATE INDEX IF NOT EXISTS "Part_normalizedModel_idx"
    ON "Part"("normalizedModel");

CREATE INDEX IF NOT EXISTS "Part_normalizedModel_normalizedPnc_idx"
    ON "Part"("normalizedModel", "normalizedPnc");

CREATE INDEX IF NOT EXISTS "Part_partNumber_idx"
    ON "Part"("partNumber");
