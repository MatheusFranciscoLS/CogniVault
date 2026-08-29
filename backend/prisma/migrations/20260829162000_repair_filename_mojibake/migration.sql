-- Corrige apenas o padrão observado em nomes de arquivo recebidos via multipart:
-- UTF-8 C2 A0 (NBSP) interpretado como Latin-1, persistido como "Â ".
-- Não remove o caractere Â em geral; palavras legítimas como LÂMINA não são afetadas.
UPDATE "Document"
SET "filename" = REPLACE("filename", chr(194) || chr(160), ' ')
WHERE POSITION(chr(194) || chr(160) IN "filename") > 0;
