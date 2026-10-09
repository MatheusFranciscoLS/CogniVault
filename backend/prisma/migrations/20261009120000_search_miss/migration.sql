-- Buscas sem resultado: só o texto digitado, agregado (sem usuário e sem cliente).

-- CreateTable
CREATE TABLE "SearchMiss" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "normalizedQuery" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 1,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SearchMiss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SearchMiss_tenantId_normalizedQuery_key" ON "SearchMiss"("tenantId", "normalizedQuery");

-- CreateIndex
CREATE INDEX "SearchMiss_tenantId_lastSeenAt_idx" ON "SearchMiss"("tenantId", "lastSeenAt");

-- AddForeignKey
ALTER TABLE "SearchMiss" ADD CONSTRAINT "SearchMiss_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Toda tabela nova nasce com RLS ligado (ver CLAUDE.md).
ALTER TABLE "SearchMiss" ENABLE ROW LEVEL SECURITY;
