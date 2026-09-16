CREATE TABLE "AiDecisionCache" (
    "key" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiDecisionCache_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "AiDecisionCache_tenantId_purpose_expiresAt_idx"
    ON "AiDecisionCache"("tenantId", "purpose", "expiresAt");
CREATE INDEX "AiDecisionCache_expiresAt_idx"
    ON "AiDecisionCache"("expiresAt");
