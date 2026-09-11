-- Fase 1: garantias de concorrência que não podem depender apenas de findFirst.
-- Os índices são parciais para preservar histórico arquivado/revisado.

CREATE UNIQUE INDEX "Document_tenant_contentHash_active_unique"
ON "Document" ("tenantId", "contentHash")
WHERE "archivedAt" IS NULL AND "contentHash" IS NOT NULL;

CREATE UNIQUE INDEX "OfficialPartVerification_pending_pair_unique"
ON "OfficialPartVerification" ("tenantId", "normalizedQueriedNumber", "normalizedCurrentNumber")
WHERE "approvalStatus" = 'PENDING';
