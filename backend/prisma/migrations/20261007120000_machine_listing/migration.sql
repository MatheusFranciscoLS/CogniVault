-- Aba "Tabela de preços": as máquinas da lista vigente da Husqvarna.
-- Tabela vazia até alguém rodar o importador (npm run import:machine-list-html).

-- CreateTable
CREATE TABLE "MachineListing" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pnc" TEXT NOT NULL,
    "normalizedPnc" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "segment" TEXT,
    "technology" TEXT,
    "application" TEXT,
    "listPrice" DOUBLE PRECISION NOT NULL,
    "discontinued" BOOLEAN NOT NULL DEFAULT false,
    "isNew" BOOLEAN NOT NULL DEFAULT false,
    "priceBefore" DOUBLE PRECISION,
    "specs" JSONB NOT NULL,
    "details" TEXT,
    "listDate" TIMESTAMP(3) NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineListing_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MachineListing_tenantId_category_idx" ON "MachineListing"("tenantId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "MachineListing_tenantId_normalizedPnc_key" ON "MachineListing"("tenantId", "normalizedPnc");

-- AddForeignKey
ALTER TABLE "MachineListing" ADD CONSTRAINT "MachineListing_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Toda tabela nova nasce com RLS ligado e zero políticas (a aplicação conecta como
-- `postgres`, dono da tabela, e passa por cima; ficam de fora `anon` e `authenticated`).
ALTER TABLE "MachineListing" ENABLE ROW LEVEL SECURITY;
