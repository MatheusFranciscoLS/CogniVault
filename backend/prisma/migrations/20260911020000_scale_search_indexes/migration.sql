-- Escala para ~200 catálogos: remove índices cobertos por índices UNIQUE
-- e adiciona índices alinhados às consultas operacionais reais.

DROP INDEX IF EXISTS "MasterPart_tenantId_normalizedNumber_idx";
DROP INDEX IF EXISTS "MasterPartSection_tenantId_normalizedNumber_idx";

CREATE INDEX IF NOT EXISTS "SearchHistory_tenantId_resultCode_createdAt_idx"
ON "SearchHistory" ("tenantId", "resultCode", "createdAt" DESC)
WHERE "resultCode" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "SearchHistory_resultModel_trgm_idx"
ON "SearchHistory" USING gin (lower("resultModel") gin_trgm_ops)
WHERE "resultModel" IS NOT NULL;
