ALTER TABLE "SearchFeedback"
    ADD COLUMN IF NOT EXISTS "reason" TEXT;

CREATE TABLE IF NOT EXISTS "SearchHistory" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "pnc" TEXT,
    "status" TEXT NOT NULL,
    "resultPartId" TEXT,
    "resultLabel" TEXT,
    "resultCode" TEXT,
    "resultModel" TEXT,
    "resultPnc" TEXT,
    "sourceFilename" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SearchHistory_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SearchHistory_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SearchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SearchHistory_resultPartId_fkey" FOREIGN KEY ("resultPartId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SearchHistory_tenantId_createdAt_idx" ON "SearchHistory"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "SearchHistory_userId_createdAt_idx" ON "SearchHistory"("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "SearchHistory_resultPartId_idx" ON "SearchHistory"("resultPartId");

CREATE TABLE IF NOT EXISTS "Favorite" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "reference" TEXT,
    "model" TEXT,
    "pnc" TEXT,
    "partId" TEXT,
    "documentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Favorite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Favorite_partId_fkey" FOREIGN KEY ("partId") REFERENCES "Part"("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Favorite_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_partId_key" ON "Favorite"("userId", "partId");
CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_userId_documentId_key" ON "Favorite"("userId", "documentId");
CREATE INDEX IF NOT EXISTS "Favorite_tenantId_userId_createdAt_idx" ON "Favorite"("tenantId", "userId", "createdAt");
