-- 027: Close every public table to Supabase's auto-generated REST API.
--
-- Supabase exposes all tables in the `public` schema through PostgREST.
-- Anyone with the project's public "anon" key can read, edit and delete
-- any table that has Row-Level Security OFF (Supabase security advisor:
-- rls_disabled_in_public). This app never uses that API — the backend
-- connects directly as `postgres`, which bypasses RLS, and storage uses
-- the service-role key — so we lock it down completely:
--
--   1. Enable RLS on every table in `public`. With no policies defined,
--      that denies all access through the REST API.
--   2. Revoke table privileges from the API roles as a second layer.
--
-- The backend is unaffected: `postgres` owns these tables and has
-- BYPASSRLS. src/db/migrate.js re-applies step 1 after every run, so
-- tables added by future migrations are covered automatically.

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN
    SELECT c.relname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
  END LOOP;

  -- The API roles only exist on Supabase; skip on a plain local Postgres.
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated';
  END IF;
END $$;
