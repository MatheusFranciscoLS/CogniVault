CREATE TYPE "OfficialVerificationStatus" AS ENUM ('VERIFIED', 'SUPERSEDED', 'REVIEW');

CREATE TABLE "OfficialPartVerification" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "OfficialVerificationStatus" NOT NULL,
    "queriedPartNumber" TEXT NOT NULL,
    "normalizedQueriedNumber" TEXT NOT NULL,
    "currentPartNumber" TEXT NOT NULL,
    "normalizedCurrentNumber" TEXT NOT NULL,
    "description" TEXT,
    "officialUrl" TEXT NOT NULL,
    "note" TEXT,
    "verifiedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OfficialPartVerification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OfficialPartVerification_tenantId_normalizedQueriedNumber_createdAt_idx"
ON "OfficialPartVerification"("tenantId", "normalizedQueriedNumber", "createdAt");

CREATE INDEX "OfficialPartVerification_tenantId_normalizedCurrentNumber_createdAt_idx"
ON "OfficialPartVerification"("tenantId", "normalizedCurrentNumber", "createdAt");

CREATE INDEX "OfficialPartVerification_tenantId_createdAt_idx"
ON "OfficialPartVerification"("tenantId", "createdAt");

CREATE INDEX "OfficialPartVerification_userId_createdAt_idx"
ON "OfficialPartVerification"("userId", "createdAt");

ALTER TABLE "OfficialPartVerification"
ADD CONSTRAINT "OfficialPartVerification_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OfficialPartVerification"
ADD CONSTRAINT "OfficialPartVerification_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
