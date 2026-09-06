-- Criação de índice composto para acelerar filtros de documentos ativos por tenant
CREATE INDEX IF NOT EXISTS "Document_tenantId_archivedAt_status_idx"
ON "Document" ("tenantId", "archivedAt", "status");
