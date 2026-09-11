CREATE TABLE "CommercialImportRun" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sourceFilename" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "priceDivisor" DOUBLE PRECISION NOT NULL,
  "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
  "masterCount" INTEGER NOT NULL DEFAULT 0,
  "sectionCount" INTEGER NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'RUNNING',
  "error" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),

  CONSTRAINT "CommercialImportRun_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CommercialImportRun_tenantId_startedAt_idx"
  ON "CommercialImportRun"("tenantId", "startedAt");

CREATE INDEX "CommercialImportRun_tenantId_sourceHash_idx"
  ON "CommercialImportRun"("tenantId", "sourceHash");

ALTER TABLE "CommercialImportRun"
  ADD CONSTRAINT "CommercialImportRun_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
