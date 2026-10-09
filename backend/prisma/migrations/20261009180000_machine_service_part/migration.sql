-- Peças de revisão por máquina (campo "reparo" da lista de preços). Vazia até a primeira atualização da lista com o campo.

-- CreateTable
CREATE TABLE "MachineServicePart" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "pnc" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineServicePart_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MachineServicePart_tenantId_pnc_normalizedNumber_key" ON "MachineServicePart"("tenantId", "pnc", "normalizedNumber");

-- CreateIndex
CREATE INDEX "MachineServicePart_tenantId_pnc_idx" ON "MachineServicePart"("tenantId", "pnc");

-- AddForeignKey
ALTER TABLE "MachineServicePart" ADD CONSTRAINT "MachineServicePart_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Toda tabela nova nasce com RLS ligado (ver CLAUDE.md).
ALTER TABLE "MachineServicePart" ENABLE ROW LEVEL SECURITY;
