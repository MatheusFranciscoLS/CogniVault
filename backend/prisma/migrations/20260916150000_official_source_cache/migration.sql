-- Persistent stale-while-revalidate cache for public manufacturer data.
CREATE TABLE "OfficialSourceCache" (
    "key" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL,
    "resourceId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "previousFingerprint" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL,
    "freshUntil" TIMESTAMP(3) NOT NULL,
    "staleUntil" TIMESTAMP(3) NOT NULL,
    "changedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialSourceCache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "OfficialSourceCache_source_resourceType_resourceId_idx"
    ON "OfficialSourceCache"("source", "resourceType", "resourceId");
CREATE INDEX "OfficialSourceCache_changedAt_idx"
    ON "OfficialSourceCache"("changedAt");
CREATE INDEX "OfficialSourceCache_freshUntil_idx"
    ON "OfficialSourceCache"("freshUntil");
