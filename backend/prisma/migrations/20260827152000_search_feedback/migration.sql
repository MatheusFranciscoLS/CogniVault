CREATE TABLE IF NOT EXISTS "SearchFeedback" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "model" TEXT,
    "normalizedModel" TEXT,
    "pnc" TEXT,
    "normalizedPnc" TEXT,
    "resultPartId" TEXT NOT NULL,
    "correct" BOOLEAN NOT NULL,
    "correctedPartId" TEXT,
    "queryEmbedding" vector(768),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchFeedback_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SearchFeedback_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SearchFeedback_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "SearchFeedback_resultPartId_fkey"
        FOREIGN KEY ("resultPartId") REFERENCES "Part"("id")
        ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SearchFeedback_correctedPartId_fkey"
        FOREIGN KEY ("correctedPartId") REFERENCES "Part"("id")
        ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SearchFeedback_tenantId_createdAt_idx"
    ON "SearchFeedback"("tenantId", "createdAt");

CREATE INDEX IF NOT EXISTS "SearchFeedback_tenantId_normalizedModel_normalizedPnc_idx"
    ON "SearchFeedback"("tenantId", "normalizedModel", "normalizedPnc");

CREATE INDEX IF NOT EXISTS "SearchFeedback_resultPartId_idx"
    ON "SearchFeedback"("resultPartId");

CREATE INDEX IF NOT EXISTS "SearchFeedback_correctedPartId_idx"
    ON "SearchFeedback"("correctedPartId");
