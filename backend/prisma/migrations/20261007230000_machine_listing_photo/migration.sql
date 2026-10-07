-- Foto de cada máquina da lista vigente, para o orçamento da máquina. Tabela vazia até o importador rodar de novo.

-- CreateTable
CREATE TABLE "MachineListingPhoto" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "normalizedPnc" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "importedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MachineListingPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MachineListingPhoto_tenantId_normalizedPnc_key" ON "MachineListingPhoto"("tenantId", "normalizedPnc");

-- AddForeignKey
ALTER TABLE "MachineListingPhoto" ADD CONSTRAINT "MachineListingPhoto_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Toda tabela nova nasce com RLS ligado e zero políticas (a aplicação conecta como `postgres`).
ALTER TABLE "MachineListingPhoto" ENABLE ROW LEVEL SECURITY;
