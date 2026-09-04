-- Criação de índices vetoriais HNSW para aceleração logarítmica de similaridade de cosseno.
-- Elimina o sequential scan em Part.embedding e DocumentChunk.embedding.

CREATE INDEX IF NOT EXISTS "Part_embedding_hnsw_idx"
ON "Part" USING hnsw ("embedding" vector_cosine_ops);

CREATE INDEX IF NOT EXISTS "DocumentChunk_embedding_hnsw_idx"
ON "DocumentChunk" USING hnsw ("embedding" vector_cosine_ops);
