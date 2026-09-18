-- CreateEnum
CREATE TYPE "QuoteStatus" AS ENUM ('DRAFT', 'SAVED');

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT,
    "status" "QuoteStatus" NOT NULL DEFAULT 'DRAFT',
    "customerName" TEXT,
    "customerPhone" TEXT,
    "paymentMethod" TEXT,
    "machineModel" TEXT,
    "notes" TEXT,
    "discountPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalItems" INTEGER NOT NULL DEFAULT 0,
    "grossTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "savedAt" TIMESTAMP(3),

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QuoteItem" (
    "id" TEXT NOT NULL,
    "quoteId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "partNumber" TEXT NOT NULL,
    "normalizedPartNumber" TEXT NOT NULL,
    "effectiveCode" TEXT,
    "name" TEXT NOT NULL,
    "model" TEXT,
    "pnc" TEXT,
    "section" TEXT,
    "position" TEXT,
    "filename" TEXT,
    "page" INTEGER,
    "isSuperseded" BOOLEAN NOT NULL DEFAULT false,
    "originalCode" TEXT,
    "notes" TEXT,
    "isService" BOOLEAN NOT NULL DEFAULT false,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPrice" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuoteItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Quote_tenantId_status_savedAt_idx" ON "Quote"("tenantId", "status", "savedAt");

-- CreateIndex
CREATE INDEX "Quote_tenantId_status_createdAt_idx" ON "Quote"("tenantId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_tenantId_createdAt_idx" ON "Quote"("tenantId", "createdAt");

-- CreateIndex
CREATE INDEX "Quote_userId_createdAt_idx" ON "Quote"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "QuoteItem_quoteId_sortOrder_idx" ON "QuoteItem"("quoteId", "sortOrder");

-- CreateIndex
CREATE INDEX "QuoteItem_normalizedPartNumber_idx" ON "QuoteItem"("normalizedPartNumber");

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuoteItem" ADD CONSTRAINT "QuoteItem_quoteId_fkey" FOREIGN KEY ("quoteId") REFERENCES "Quote"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Complementos escritos à mão (não saem do `prisma migrate diff`)
-- ---------------------------------------------------------------------------

-- Um único rascunho (cesta aberta) por atendente. Prisma não expressa índice
-- parcial, então a garantia fica aqui: sem isso, duas abas do mesmo navegador
-- ou um retry de rede criariam cestas paralelas e o atendente perderia itens.
CREATE UNIQUE INDEX "Quote_one_draft_per_user"
  ON "Quote" ("tenantId", "userId")
  WHERE "status" = 'DRAFT' AND "userId" IS NOT NULL;

-- Métrica "peças mais cotadas" varre item de orçamento salvo por período.
-- Sem este índice a consulta do painel do dono faz seq scan em QuoteItem.
CREATE INDEX "QuoteItem_normalizedPartNumber_isService_idx"
  ON "QuoteItem" ("normalizedPartNumber", "isService");

-- Mesma barreira das outras tabelas de negócio: o CogniVault só acessa dados
-- pela API própria/Prisma, nunca pela Data API do Supabase.
-- Ver 20260911174000_lock_down_supabase_data_api.
ALTER TABLE public."Quote" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."QuoteItem" ENABLE ROW LEVEL SECURITY;

-- O CI usa PostgreSQL puro, onde os roles do Supabase não existem.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."Quote" FROM anon;
    REVOKE ALL ON TABLE public."QuoteItem" FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."Quote" FROM authenticated;
    REVOKE ALL ON TABLE public."QuoteItem" FROM authenticated;
  END IF;
END
$$;
