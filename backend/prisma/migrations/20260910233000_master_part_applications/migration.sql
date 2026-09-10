-- CogniVault V2: inteligência operacional do balcão e metadados da lista de preços.

CREATE TABLE "MasterPartSection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "application" TEXT,
    "reference" TEXT,
    "productCategory" TEXT,
    "itemType" TEXT,
    "groupCode" TEXT,
    "sourceSheet" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterPartSection_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PartLocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "normalizedPartNumber" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "note" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartLocation_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "QuoteUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "sessionId" TEXT NOT NULL,
    "normalizedPartNumber" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "model" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MasterPartSection_tenantId_normalizedNumber_section_key"
ON "MasterPartSection"("tenantId", "normalizedNumber", "section");
CREATE INDEX "MasterPartSection_tenantId_section_idx"
ON "MasterPartSection"("tenantId", "section");
CREATE INDEX "MasterPartSection_tenantId_application_idx"
ON "MasterPartSection"("tenantId", "application");
CREATE INDEX "MasterPartSection_tenantId_normalizedNumber_idx"
ON "MasterPartSection"("tenantId", "normalizedNumber");

CREATE UNIQUE INDEX "PartLocation_tenantId_normalizedPartNumber_key"
ON "PartLocation"("tenantId", "normalizedPartNumber");
CREATE INDEX "PartLocation_tenantId_normalizedPartNumber_idx"
ON "PartLocation"("tenantId", "normalizedPartNumber");
CREATE INDEX "PartLocation_updatedById_idx"
ON "PartLocation"("updatedById");

CREATE UNIQUE INDEX "QuoteUsage_tenantId_sessionId_normalizedPartNumber_key"
ON "QuoteUsage"("tenantId", "sessionId", "normalizedPartNumber");
CREATE INDEX "QuoteUsage_tenantId_normalizedPartNumber_createdAt_idx"
ON "QuoteUsage"("tenantId", "normalizedPartNumber", "createdAt");
CREATE INDEX "QuoteUsage_tenantId_model_createdAt_idx"
ON "QuoteUsage"("tenantId", "model", "createdAt");
CREATE INDEX "QuoteUsage_tenantId_sessionId_idx"
ON "QuoteUsage"("tenantId", "sessionId");
CREATE INDEX "QuoteUsage_userId_createdAt_idx"
ON "QuoteUsage"("userId", "createdAt");

ALTER TABLE "MasterPartSection"
ADD CONSTRAINT "MasterPartSection_masterPart_fkey"
FOREIGN KEY ("tenantId", "normalizedNumber")
REFERENCES "MasterPart"("tenantId", "normalizedNumber")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PartLocation"
ADD CONSTRAINT "PartLocation_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PartLocation"
ADD CONSTRAINT "PartLocation_updatedById_fkey"
FOREIGN KEY ("updatedById") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "QuoteUsage"
ADD CONSTRAINT "QuoteUsage_tenantId_fkey"
FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "QuoteUsage"
ADD CONSTRAINT "QuoteUsage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
