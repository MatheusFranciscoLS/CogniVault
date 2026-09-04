-- Criação de índice trigram direto na coluna searchText da tabela Part.
-- Permite que o PostgreSQL use o índice GIN quando o Prisma executa ILIKE sem transformar a coluna com lower().

CREATE INDEX IF NOT EXISTS "Part_searchText_direct_gin_idx"
ON "Part" USING GIN ("searchText" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "DocumentChunk_searchText_direct_gin_idx"
ON "DocumentChunk" USING GIN ("searchText" gin_trgm_ops);
