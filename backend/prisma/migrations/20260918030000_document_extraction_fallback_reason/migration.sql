-- Registra por que a leitura textual do PDF recusou o catálogo e o
-- processamento caiu para a leitura visual com IA.
--
-- Coluna anulável e sem backfill de propósito: catálogo já processado
-- continua com NULL, que significa "motivo desconhecido (processado antes
-- desta versão)", e não "extração determinística funcionou". A distinção
-- entre os dois vem de `extractionMethod`, que já diz qual caminho foi usado.
ALTER TABLE "Document" ADD COLUMN "extractionFallbackReason" TEXT;

-- Quantas linhas a gravação recusou por código implausível. O descarte protege
-- o balcão de vender peça errada, e o contador impede que ele seja silencioso.
ALTER TABLE "Document" ADD COLUMN "extractionRejectedParts" INTEGER NOT NULL DEFAULT 0;
