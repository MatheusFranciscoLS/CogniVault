-- V7 Parte 1: identidade estável de peças e reprocessamento preservador.
-- Esta migration é somente aditiva e não remove dados existentes.

ALTER TABLE "Document"
    ADD COLUMN IF NOT EXISTS "catalogRevision" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Part"
    ADD COLUMN IF NOT EXISTS "normalizedPartNumber" TEXT,
    ADD COLUMN IF NOT EXISTS "sourceKey" TEXT,
    ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS "retiredAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "extractionRevision" INTEGER NOT NULL DEFAULT 1;

UPDATE "Part"
SET "normalizedPartNumber" = regexp_replace(upper("partNumber"), '[^A-Z0-9]', '', 'g')
WHERE "normalizedPartNumber" IS NULL;

UPDATE "Document" AS d
SET "catalogRevision" = 1
WHERE d."catalogRevision" = 0
  AND EXISTS (
      SELECT 1
      FROM "Part" AS p
      WHERE p."documentId" = d."id"
  );

ALTER TABLE "Part"
    ADD CONSTRAINT "Part_normalizedPartNumber_not_null"
    CHECK ("normalizedPartNumber" IS NOT NULL) NOT VALID;

ALTER TABLE "Part"
    VALIDATE CONSTRAINT "Part_normalizedPartNumber_not_null";

ALTER TABLE "Part"
    ALTER COLUMN "normalizedPartNumber" SET NOT NULL;

ALTER TABLE "Part"
    DROP CONSTRAINT "Part_normalizedPartNumber_not_null";

CREATE INDEX IF NOT EXISTS "Part_normalizedPartNumber_active_idx"
    ON "Part"("normalizedPartNumber", "active");
CREATE INDEX IF NOT EXISTS "Part_documentId_active_idx"
    ON "Part"("documentId", "active");
CREATE INDEX IF NOT EXISTS "Part_documentId_sourceKey_idx"
    ON "Part"("documentId", "sourceKey");

-- Índices ausentes em chaves estrangeiras e filtros frequentes.
CREATE INDEX IF NOT EXISTS "User_tenantId_idx" ON "User"("tenantId");
CREATE INDEX IF NOT EXISTS "Category_tenantId_idx" ON "Category"("tenantId");
CREATE INDEX IF NOT EXISTS "Document_categoryId_idx" ON "Document"("categoryId");
CREATE INDEX IF NOT EXISTS "DocumentChunk_documentId_idx" ON "DocumentChunk"("documentId");
CREATE INDEX IF NOT EXISTS "SearchFeedback_userId_idx" ON "SearchFeedback"("userId");
CREATE INDEX IF NOT EXISTS "Favorite_partId_idx" ON "Favorite"("partId");
CREATE INDEX IF NOT EXISTS "Favorite_documentId_idx" ON "Favorite"("documentId");
