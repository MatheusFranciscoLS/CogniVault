-- A lista de preços é uma fonte de ingestão, não uma dependência de runtime.
-- MasterPart mantém o cadastro comercial único por código e esta tabela preserva
-- todas as aplicações/categorias em que o mesmo código aparece na lista vigente.

CREATE TABLE IF NOT EXISTS "MasterPartApplication" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "partNumber" TEXT NOT NULL,
    "application" TEXT,
    "applicationKey" TEXT NOT NULL DEFAULT '',
    "commercialCategory" TEXT NOT NULL,
    "subCategory" TEXT,
    "reference" TEXT,
    "itemType" TEXT,
    "sourceSheet" TEXT NOT NULL,
    "sourceRow" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MasterPartApplication_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "MasterPartApplication_master_part_fkey"
        FOREIGN KEY ("tenantId", "normalizedNumber")
        REFERENCES "MasterPart"("tenantId", "normalizedNumber")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "MasterPartApplication_identity_key"
    ON "MasterPartApplication"(
        "tenantId",
        "normalizedNumber",
        "applicationKey",
        "commercialCategory",
        "sourceSheet"
    );

CREATE INDEX IF NOT EXISTS "MasterPartApplication_code_idx"
    ON "MasterPartApplication"("tenantId", "normalizedNumber");

CREATE INDEX IF NOT EXISTS "MasterPartApplication_application_idx"
    ON "MasterPartApplication"("tenantId", "applicationKey");

CREATE INDEX IF NOT EXISTS "MasterPartApplication_category_idx"
    ON "MasterPartApplication"("tenantId", "commercialCategory");
