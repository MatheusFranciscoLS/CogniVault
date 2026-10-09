-- Histórico do que cada atualização da lista de preços mudou, para desfazer a última. Vazia até a próxima atualização.

-- CreateTable
CREATE TABLE "PriceListChange" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "before" DOUBLE PRECISION,
    "after" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "undoneAt" TIMESTAMP(3),

    CONSTRAINT "PriceListChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PriceListChange_tenantId_runId_idx" ON "PriceListChange"("tenantId", "runId");

-- CreateIndex
CREATE INDEX "PriceListChange_tenantId_createdAt_idx" ON "PriceListChange"("tenantId", "createdAt");

-- AddForeignKey
ALTER TABLE "PriceListChange" ADD CONSTRAINT "PriceListChange_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Toda tabela nova nasce com RLS ligado (ver CLAUDE.md).
ALTER TABLE "PriceListChange" ENABLE ROW LEVEL SECURITY;
