-- Internal caches are backend-only tables.
-- Keep direct database access working for postgres/service_role (both BYPASSRLS)
-- while adding an explicit RLS barrier for Data API roles.

ALTER TABLE public."OfficialSourceCache" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AiDecisionCache" ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public."OfficialSourceCache" FROM anon, authenticated;
REVOKE ALL ON TABLE public."AiDecisionCache" FROM anon, authenticated;
