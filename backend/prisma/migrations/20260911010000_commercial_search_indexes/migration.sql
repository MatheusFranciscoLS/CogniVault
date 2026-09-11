-- O cadastro comercial não precisa duplicar os vetores dos catálogos técnicos.
-- Para ~26 mil códigos, trigramas sobre os campos reais entregam busca parcial,
-- tolerante a caixa e rápida para descrição/aplicação/referência.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS "MasterPart_name_trgm_idx"
ON "MasterPart" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "MasterPart_description_trgm_idx"
ON "MasterPart" USING GIN ("description" gin_trgm_ops)
WHERE "description" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "MasterPart_brand_trgm_idx"
ON "MasterPart" USING GIN ("brand" gin_trgm_ops)
WHERE "brand" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "MasterPartSection_application_trgm_idx"
ON "MasterPartSection" USING GIN ("application" gin_trgm_ops)
WHERE "application" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "MasterPartSection_reference_trgm_idx"
ON "MasterPartSection" USING GIN ("reference" gin_trgm_ops)
WHERE "reference" IS NOT NULL;

CREATE INDEX IF NOT EXISTS "MasterPartSection_productCategory_trgm_idx"
ON "MasterPartSection" USING GIN ("productCategory" gin_trgm_ops)
WHERE "productCategory" IS NOT NULL;
