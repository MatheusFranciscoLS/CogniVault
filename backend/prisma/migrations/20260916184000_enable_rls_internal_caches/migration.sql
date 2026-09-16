-- Internal caches are backend-only tables.
-- Keep direct database access working for postgres/service_role (both BYPASSRLS)
-- while adding an explicit RLS barrier for Data API roles.

ALTER TABLE public."OfficialSourceCache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AiDecisionCache" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON TABLE public."OfficialSourceCache" FROM anon;
    REVOKE ALL ON TABLE public."AiDecisionCache" FROM anon;
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON TABLE public."OfficialSourceCache" FROM authenticated;
    REVOKE ALL ON TABLE public."AiDecisionCache" FROM authenticated;
  END IF;
END
$$;
