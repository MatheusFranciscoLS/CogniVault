-- Repara a linha do tempo de migrations: MasterPart passou a existir no schema
-- antes de possuir uma migration própria. Esta migration é idempotente para
-- bancos existentes e garante que instalações novas possam chegar à V2.

CREATE TABLE IF NOT EXISTS "MasterPart" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" DOUBLE PRECISION,
    "ncm" TEXT,
    "ean" TEXT,
    "category" TEXT,
    "brand" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterPart_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MasterPart_tenantId_normalizedNumber_key"
ON "MasterPart"("tenantId", "normalizedNumber");

CREATE INDEX IF NOT EXISTS "MasterPart_tenantId_normalizedNumber_idx"
ON "MasterPart"("tenantId", "normalizedNumber");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'MasterPart_tenantId_fkey'
          AND conrelid = '"MasterPart"'::regclass
    ) THEN
        ALTER TABLE "MasterPart"
        ADD CONSTRAINT "MasterPart_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id")
        ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;
