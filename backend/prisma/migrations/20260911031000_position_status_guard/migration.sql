ALTER TABLE "Part"
  ALTER COLUMN "positionStatus" SET DEFAULT 'SUSPECT_MISSING';

CREATE OR REPLACE FUNCTION public.cognivault_guard_part_position()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  raw_position text := btrim(COALESCE(NEW."position", ''));
  raw_evidence text := btrim(COALESCE(NEW."positionEvidence", ''));
  explicit_unpositioned boolean := false;
BEGIN
  explicit_unpositioned :=
    raw_position ~ '^(--+|-\s+-|–+|—+)$'
    OR raw_evidence ~ '^(--+|-\s+-|–+|—+)$'
    OR NEW."positionStatus" = 'SOURCE_UNPOSITIONED';

  IF raw_position <> '' AND NOT explicit_unpositioned THEN
    NEW."position" := raw_position;
    NEW."positionStatus" := 'POSITIONED';
    IF raw_evidence = '' THEN NEW."positionEvidence" := raw_position; END IF;
    RETURN NEW;
  END IF;

  NEW."position" := NULL;
  IF explicit_unpositioned THEN
    NEW."positionStatus" := 'SOURCE_UNPOSITIONED';
    IF raw_evidence = '' THEN
      NEW."positionEvidence" := CASE WHEN raw_position <> '' THEN raw_position ELSE '--' END;
    END IF;
  ELSE
    NEW."positionStatus" := 'SUSPECT_MISSING';
    NEW."positionEvidence" := NULLIF(raw_evidence, '');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Part_position_integrity_guard" ON "Part";
CREATE TRIGGER "Part_position_integrity_guard"
BEFORE INSERT OR UPDATE OF "position", "positionStatus", "positionEvidence"
ON "Part"
FOR EACH ROW
EXECUTE FUNCTION public.cognivault_guard_part_position();

-- Reaplica a regra a linhas históricas para deixar o estado consistente.
UPDATE "Part" SET "position" = "position";

CREATE OR REPLACE FUNCTION public.cognivault_guard_catalog_ready_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  suspect_count integer;
  integrity_reason text := 'Há peça(s) cuja posição KEY/REF não foi comprovada no PDF; revisar antes de considerar o catálogo íntegro.';
BEGIN
  IF NEW."reviewStatus" <> 'READY' THEN RETURN NEW; END IF;

  SELECT count(*) INTO suspect_count
  FROM "Part" p
  WHERE p."documentId" = NEW.id
    AND p."active" = true
    AND p."positionStatus" = 'SUSPECT_MISSING';

  IF suspect_count > 0 THEN
    NEW."reviewStatus" := 'NEEDS_REVIEW';
    NEW."healthScore" := LEAST(NEW."healthScore", 85);
    IF NOT (integrity_reason = ANY(NEW."reviewReasons")) THEN
      NEW."reviewReasons" := array_append(NEW."reviewReasons", integrity_reason);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS "Document_position_integrity_guard" ON "Document";
CREATE TRIGGER "Document_position_integrity_guard"
BEFORE UPDATE OF "reviewStatus", "healthScore", "reviewReasons"
ON "Document"
FOR EACH ROW
EXECUTE FUNCTION public.cognivault_guard_catalog_ready_status();
