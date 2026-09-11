-- O runtime usa ILIKE direto em Part.searchText, portanto o GIN direto permanece.
-- O índice equivalente em lower(searchText) não é usado pelo plano atual e duplicava ~28 MB.
DROP INDEX IF EXISTS "Part_searchText_trgm_idx";

-- Embeddings estão desativados na estratégia structured-first. Os vetores antigos
-- continuam armazenados e o índice HNSW pode ser recriado futuramente se a busca
-- vetorial voltar a ser necessária.
DROP INDEX IF EXISTS "Part_embedding_hnsw_idx";

-- A memória técnica usa FTS e fuzzy sobre lower(searchText), então mantemos
-- DocumentChunk_searchText_fts_idx + DocumentChunk_searchText_trgm_idx.
-- O GIN direto era duplicado e não participa do caminho de consulta atual.
DROP INDEX IF EXISTS "DocumentChunk_searchText_direct_gin_idx";
DROP INDEX IF EXISTS "DocumentChunk_embedding_hnsw_idx";
