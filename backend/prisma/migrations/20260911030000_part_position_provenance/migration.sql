DO $$
BEGIN
  CREATE TYPE "PartPositionStatus" AS ENUM ('POSITIONED', 'SOURCE_UNPOSITIONED', 'SUSPECT_MISSING');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "Part"
  ADD COLUMN IF NOT EXISTS "positionStatus" "PartPositionStatus" NOT NULL DEFAULT 'POSITIONED',
  ADD COLUMN IF NOT EXISTS "positionEvidence" TEXT;

UPDATE "Part"
SET "positionStatus" = 'POSITIONED'
WHERE "position" IS NOT NULL AND btrim("position") <> '';

-- Posição vazia nunca recebe número inventado: fica suspeita até a fonte
-- comprovar que a coluna KEY/REF está vazia ou usa '--'.
UPDATE "Part"
SET "positionStatus" = 'SUSPECT_MISSING'
WHERE "position" IS NULL OR btrim("position") = '';

CREATE INDEX IF NOT EXISTS "Part_documentId_positionStatus_idx"
  ON "Part" ("documentId", "positionStatus")
  WHERE "active" = true;
