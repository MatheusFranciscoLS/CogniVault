-- Reparação aditiva: uma versão provisória da migração 20260830170000 chegou a
-- ser registrada em produção antes de conter estas colunas. Nenhum dado é
-- removido ou recriado.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OfficialVerificationApprovalStatus') THEN
    CREATE TYPE "OfficialVerificationApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
  END IF;
END $$;

ALTER TABLE "OfficialPartVerification"
ADD COLUMN IF NOT EXISTS "approvalStatus" "OfficialVerificationApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN IF NOT EXISTS "reviewedById" TEXT,
ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "reviewNote" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'OfficialPartVerification_reviewedById_fkey'
      AND conrelid = '"OfficialPartVerification"'::regclass
  ) THEN
    ALTER TABLE "OfficialPartVerification"
    ADD CONSTRAINT "OfficialPartVerification_reviewedById_fkey"
    FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OfficialPartVerification_tenantId_approvalStatus_createdAt_idx"
ON "OfficialPartVerification"("tenantId", "approvalStatus", "createdAt");

CREATE INDEX IF NOT EXISTS "OfficialPartVerification_reviewedById_createdAt_idx"
ON "OfficialPartVerification"("reviewedById", "createdAt");
