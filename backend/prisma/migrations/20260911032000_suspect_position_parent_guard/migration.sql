CREATE OR REPLACE FUNCTION public.cognivault_demote_document_on_suspect_position()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  integrity_reason text := 'Há peça(s) cuja posição KEY/REF não foi comprovada no PDF; revisar antes de considerar o catálogo íntegro.';
BEGIN
  IF NEW."active" = true AND NEW."positionStatus" = 'SUSPECT_MISSING' THEN
    UPDATE "Document"
    SET
      "reviewStatus" = 'NEEDS_REVIEW',
      "healthScore" = LEAST("healthScore", 85),
      "reviewReasons" = CASE
        WHEN integrity_reason = ANY("reviewReasons") THEN "reviewReasons"
        ELSE array_append("reviewReasons", integrity_reason)
      END,
      "qualityCheckedAt" = now()
    WHERE "id" = NEW."documentId"
      AND "archivedAt" IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Part_suspect_position_parent_guard" ON "Part";
CREATE TRIGGER "Part_suspect_position_parent_guard"
AFTER INSERT OR UPDATE OF "active", "positionStatus"
ON "Part"
FOR EACH ROW
WHEN (NEW."active" = true AND NEW."positionStatus" = 'SUSPECT_MISSING')
EXECUTE FUNCTION public.cognivault_demote_document_on_suspect_position();

-- Não promovemos automaticamente quando a posição é corrigida. A promoção
-- depende do refreshCatalogHealth, que reavalia o catálogo inteiro antes de READY.
