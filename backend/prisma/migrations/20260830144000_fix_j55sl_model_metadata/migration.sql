-- Hotfix específico para o catálogo Husqvarna J55 SL já existente.
-- O PDF e os Part Numbers permanecem inalterados; corrigimos somente a grafia
-- do modelo e o diagnóstico derivado do metadado inconsistente da extração antiga.

UPDATE "Part"
SET
  "model" = 'J55 SL',
  "normalizedModel" = 'J55SL',
  "searchText" = replace(replace("searchText", 'J 55S L', 'J55 SL'), 'J55SL', 'J55 SL')
WHERE "documentId" = '6e594b9e-3e03-4eb7-bea6-01a8729f42a1'
  AND "normalizedModel" = 'J55SL';

UPDATE "Document"
SET
  "model" = 'J55 SL',
  "extractionSnapshot" = CASE
    WHEN "extractionSnapshot" IS NULL THEN NULL
    ELSE jsonb_set(
      jsonb_set(
        "extractionSnapshot",
        '{models}',
        '["J55 SL"]'::jsonb,
        true
      ),
      '{parts}',
      COALESCE(
        (
          SELECT jsonb_agg(jsonb_set(item, '{model}', to_jsonb('J55 SL'::text), true))
          FROM jsonb_array_elements(COALESCE("extractionSnapshot"->'parts', '[]'::jsonb)) AS items(item)
        ),
        '[]'::jsonb
      ),
      true
    )
  END,
  "healthScore" = 100,
  "reviewStatus" = 'READY',
  "reviewReasons" = ARRAY[
    'Índice vetorial indisponível; busca textual e fuzzy continuam ativas.',
    'Extração visual por IA: recomenda-se revisão amostral das primeiras consultas.'
  ],
  "qualityCheckedAt" = CURRENT_TIMESTAMP
WHERE "id" = '6e594b9e-3e03-4eb7-bea6-01a8729f42a1'
  AND "pnc" = '96121001801'
  AND "filename" = 'Cortador de grama Husqvarna J55SL.pdf';
