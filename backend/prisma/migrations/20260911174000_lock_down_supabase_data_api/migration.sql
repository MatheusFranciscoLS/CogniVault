-- CogniVault acessa os dados de negócio somente pela API própria/Prisma.
-- As tabelas em public não devem ficar acessíveis diretamente pela Data API
-- através dos roles anon/authenticated do Supabase.

ALTER TABLE public."Tenant" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Category" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Document" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Part" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."DocumentChunk" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SearchFeedback" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."SearchHistory" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Favorite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AuditLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."OfficialPartVerification" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AiBenchmarkRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MasterPart" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."MasterPartSection" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."PartLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."QuoteUsage" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."CommercialImportRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."_prisma_migrations" ENABLE ROW LEVEL SECURITY;

-- O CI usa PostgreSQL puro, onde os roles do Supabase não existem. As
-- revogações são condicionais para a mesma migration funcionar nos dois ambientes.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE
      public."Tenant", public."User", public."Category", public."Document",
      public."Part", public."DocumentChunk", public."SearchFeedback",
      public."SearchHistory", public."Favorite", public."AuditLog",
      public."OfficialPartVerification", public."AiBenchmarkRun",
      public."MasterPart", public."MasterPartSection", public."PartLocation",
      public."QuoteUsage", public."CommercialImportRun", public."_prisma_migrations"
      FROM anon';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL PRIVILEGES ON TABLE
      public."Tenant", public."User", public."Category", public."Document",
      public."Part", public."DocumentChunk", public."SearchFeedback",
      public."SearchHistory", public."Favorite", public."AuditLog",
      public."OfficialPartVerification", public."AiBenchmarkRun",
      public."MasterPart", public."MasterPartSection", public."PartLocation",
      public."QuoteUsage", public."CommercialImportRun", public."_prisma_migrations"
      FROM authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated';
  END IF;
END $$;

-- Trigger functions permanecem internas. Fixar search_path elimina resolução
-- dependente do role/sessão e evita shadowing de objetos em schemas inesperados.
ALTER FUNCTION public.cognivault_guard_part_position()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.cognivault_guard_catalog_ready_status()
  SET search_path = pg_catalog, public;
ALTER FUNCTION public.cognivault_demote_document_on_suspect_position()
  SET search_path = pg_catalog, public;
