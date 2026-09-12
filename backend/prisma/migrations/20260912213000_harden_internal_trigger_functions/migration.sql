-- As funções abaixo existem apenas para triggers internos do CogniVault.
-- O backend usa Prisma/PostgreSQL diretamente e não precisa expô-las como RPC
-- através dos roles da Data API do Supabase.
REVOKE EXECUTE ON FUNCTION public.cognivault_guard_part_position() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cognivault_guard_catalog_ready_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cognivault_demote_document_on_suspect_position() FROM PUBLIC;

-- Mantém a migration portátil para PostgreSQL puro no CI, onde os roles do
-- Supabase podem não existir. Revoga também qualquer grant explícito residual.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cognivault_guard_part_position() FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cognivault_guard_catalog_ready_status() FROM anon';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cognivault_demote_document_on_suspect_position() FROM anon';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cognivault_guard_part_position() FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cognivault_guard_catalog_ready_status() FROM authenticated';
    EXECUTE 'REVOKE EXECUTE ON FUNCTION public.cognivault_demote_document_on_suspect_position() FROM authenticated';
  END IF;
END $$;
