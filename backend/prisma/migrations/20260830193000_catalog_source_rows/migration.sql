ALTER TABLE "Document"
ADD COLUMN IF NOT EXISTS "sourceRowCount" INTEGER NOT NULL DEFAULT 0;

UPDATE "Document" d
SET "sourceRowCount" = source_rows.row_count
FROM (
  SELECT
    p."documentId",
    COUNT(DISTINCT concat_ws(
      '|',
      COALESCE(p."page"::text, ''),
      COALESCE(p."section", ''),
      COALESCE(p."position", ''),
      COALESCE(p."normalizedPartNumber", ''),
      COALESCE(p."normalizedName", ''),
      COALESCE(p."notes", '')
    ))::integer AS row_count
  FROM "Part" p
  WHERE p."active" = TRUE
  GROUP BY p."documentId"
) source_rows
WHERE d."id" = source_rows."documentId";
