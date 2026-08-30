-- Corrige somente metadados comprovadamente contaminados por linhas de peça
-- em três catálogos Husqvarna já existentes. PDFs, Part Numbers, PNCs e regras
-- de aplicação permanecem inalterados.

-- TS 148: o modelo antigo veio da primeira linha da tabela: 1 / 586047302 / DECALQUE.
UPDATE "Part"
SET
  "model" = 'TS 148',
  "normalizedModel" = 'TS148',
  "searchText" = regexp_replace(
    "searchText",
    E'Modelo: 1[ \\t]+586047302[ \\t\\r\\n]+DECALQUE',
    'Modelo: TS 148',
    'g'
  )
WHERE "documentId" = '1c0e6509-9b6a-4638-91ba-f67ee399876e';

UPDATE "Document"
SET
  "model" = 'TS 148',
  "extractionSnapshot" = CASE
    WHEN "extractionSnapshot" IS NULL THEN NULL
    ELSE jsonb_set(
      jsonb_set("extractionSnapshot", '{models}', '["TS 148"]'::jsonb, true),
      '{parts}',
      COALESCE((
        SELECT jsonb_agg(jsonb_set(item, '{model}', to_jsonb('TS 148'::text), true))
        FROM jsonb_array_elements(COALESCE("extractionSnapshot"->'parts', '[]'::jsonb)) AS items(item)
      ), '[]'::jsonb),
      true
    )
  END,
  "qualityCheckedAt" = CURRENT_TIMESTAMP
WHERE "id" = '1c0e6509-9b6a-4638-91ba-f67ee399876e';

-- TS 254G: mesma contaminação pela linha do decalque.
UPDATE "Part"
SET
  "model" = 'TS 254G',
  "normalizedModel" = 'TS254G',
  "searchText" = regexp_replace(
    "searchText",
    E'Modelo: 1[ \\t]+586047302[ \\t\\r\\n]+DECALQUE',
    'Modelo: TS 254G',
    'g'
  )
WHERE "documentId" = '7157a3be-885a-447c-affc-f85feb20fc1f';

UPDATE "Document"
SET
  "model" = 'TS 254G',
  "extractionSnapshot" = CASE
    WHEN "extractionSnapshot" IS NULL THEN NULL
    ELSE jsonb_set(
      jsonb_set("extractionSnapshot", '{models}', '["TS 254G"]'::jsonb, true),
      '{parts}',
      COALESCE((
        SELECT jsonb_agg(jsonb_set(item, '{model}', to_jsonb('TS 254G'::text), true))
        FROM jsonb_array_elements(COALESCE("extractionSnapshot"->'parts', '[]'::jsonb)) AS items(item)
      ), '[]'::jsonb),
      true
    )
  END,
  "qualityCheckedAt" = CURRENT_TIMESTAMP
WHERE "id" = '7157a3be-885a-447c-affc-f85feb20fc1f';

-- R 316TX: corrige o modelo capturado da linha da polia e o mojibake do nome do arquivo.
UPDATE "Part"
SET
  "model" = 'R 316TX',
  "normalizedModel" = 'R316TX',
  "searchText" = regexp_replace(
    "searchText",
    E'Modelo: 6[ \\t]+535482401[ \\t\\r\\n]+POLIA',
    'Modelo: R 316TX',
    'g'
  )
WHERE "documentId" = 'db809cb5-35d3-4947-8d47-d2a515a362fe';

UPDATE "Document"
SET
  "filename" = 'Trator cortador de grama Husqvarna R 316TX.pdf',
  "model" = 'R 316TX',
  "extractionSnapshot" = CASE
    WHEN "extractionSnapshot" IS NULL THEN NULL
    ELSE jsonb_set(
      jsonb_set("extractionSnapshot", '{models}', '["R 316TX"]'::jsonb, true),
      '{parts}',
      COALESCE((
        SELECT jsonb_agg(jsonb_set(item, '{model}', to_jsonb('R 316TX'::text), true))
        FROM jsonb_array_elements(COALESCE("extractionSnapshot"->'parts', '[]'::jsonb)) AS items(item)
      ), '[]'::jsonb),
      true
    )
  END,
  "qualityCheckedAt" = CURRENT_TIMESTAMP
WHERE "id" = 'db809cb5-35d3-4947-8d47-d2a515a362fe';
