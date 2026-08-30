-- Regras de qualidade evoluem sem alterar as peças. Invalidamos somente o
-- diagnóstico persistido para que ele seja recalculado com as regras atuais.
UPDATE "Document" AS d
SET
  "healthScore" = 0,
  "reviewStatus" = 'PENDING',
  "reviewReasons" = ARRAY['Qualidade pendente de recálculo após atualização das regras de integridade.']::text[],
  "qualityCheckedAt" = NULL
WHERE d."status" = 'COMPLETED'
  AND d."processingStage" <> 'REMOVED'
  AND EXISTS (
    SELECT 1
    FROM "Part" AS p
    WHERE p."documentId" = d."id"
      AND p."active" = true
  );
