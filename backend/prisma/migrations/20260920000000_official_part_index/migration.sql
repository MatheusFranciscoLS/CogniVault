-- Pecas lidas do catalogo oficial do fabricante, agora pesquisaveis.
--
-- O cache de fonte oficial responde "quais as pecas do motor X". Faltava o
-- contrario: "o cliente chegou com o codigo 592358, o que e e de que motor e".
-- Cada atendimento lia ate 283 pecas e jogava fora.
--
-- Sem tenantId: dado publico do fabricante, mesmo criterio do OfficialSourceCache.
CREATE TABLE "OfficialPartIndex" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "engineModel" TEXT NOT NULL,
    "normalizedEngine" TEXT NOT NULL,
    "assembly" TEXT,
    -- Vazio em vez de NULL: entra na chave unica, e no Postgres NULL nao casa
    -- com NULL num indice unico — duas leituras criariam linhas duplicadas.
    "position" TEXT NOT NULL DEFAULT '',
    "partNumber" TEXT NOT NULL,
    "normalizedNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "quantity" INTEGER,
    "readAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OfficialPartIndex_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OfficialPartIndex_source_engine_number_position_key"
    ON "OfficialPartIndex"("source", "normalizedEngine", "normalizedNumber", "position");
CREATE INDEX "OfficialPartIndex_normalizedNumber_idx" ON "OfficialPartIndex"("normalizedNumber");
CREATE INDEX "OfficialPartIndex_normalizedEngine_idx" ON "OfficialPartIndex"("normalizedEngine");
