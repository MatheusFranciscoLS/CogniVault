CREATE TYPE "OfficialVerificationApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

ALTER TABLE "OfficialPartVerification"
ADD COLUMN "approvalStatus" "OfficialVerificationApprovalStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "reviewedById" TEXT,
ADD COLUMN "reviewedAt" TIMESTAMP(3),
ADD COLUMN "reviewNote" TEXT;

-- Registros criados antes deste fluxo já eram confirmados diretamente por Administrador.
UPDATE "OfficialPartVerification"
SET "approvalStatus" = 'APPROVED';

ALTER TABLE "OfficialPartVerification"
ADD CONSTRAINT "OfficialPartVerification_reviewedById_fkey"
FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "OfficialPartVerification_tenantId_approvalStatus_createdAt_idx"
ON "OfficialPartVerification"("tenantId", "approvalStatus", "createdAt");

CREATE INDEX "OfficialPartVerification_reviewedById_createdAt_idx"
ON "OfficialPartVerification"("reviewedById", "createdAt");
