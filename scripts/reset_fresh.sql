-- backend/scripts/reset_fresh.sql
--
-- NUCLEAR RESET — wipes all business data and re-ranges the QR digit
-- sequences for a fresh business launch. IRREVERSIBLE.
--
-- Lives in scripts/ (not migrations/) so src/db/migrate.js doesn't
-- replay it on every deploy.
--
-- Run:  cd backend && psql "$DATABASE_URL" -f scripts/reset_fresh.sql

BEGIN;

-- 1. Wipe every customer-facing table that actually exists in this
--    schema. Candidate list covers historical names; the DO block
--    filters to the ones present so a missing/renamed table (e.g.
--    alert_logs on your DB) doesn't abort the transaction.
--    Deliberately NOT wiped: promo_video (admin-set home creative).
DO $$
DECLARE
  candidates text[] := ARRAY[
    'qrdata',
    'family_details',
    'manual_qr',
    'alert_logs',
    'alert_events',
    'caller_activity',
    'call_logs',
    'callHistory',
    'notifications',
    'user_contacts',
    'users',
    'payments',
    'login_otp'
  ];
  tbl text;
  existing text[] := ARRAY[]::text[];
BEGIN
  FOREACH tbl IN ARRAY candidates LOOP
    IF EXISTS (
      SELECT 1 FROM pg_tables
       WHERE schemaname = 'public'
         AND tablename  = tbl
    ) THEN
      existing := array_append(existing, format('%I', tbl));
    END IF;
  END LOOP;

  IF array_length(existing, 1) IS NULL THEN
    RAISE NOTICE 'No matching tables to truncate.';
  ELSE
    RAISE NOTICE 'Truncating: %', array_to_string(existing, ', ');
    EXECUTE format(
      'TRUNCATE TABLE %s RESTART IDENTITY CASCADE',
      array_to_string(existing, ', ')
    );
  END IF;
END$$;

-- 2. Re-range the digit sequences:
--      Normal (paid in-app) : 1     .. 10000  → padded to 00001 .. 10000
--      Manual (sticker)     : 10001 .. 90000  → padded to 10001 .. 90000
--    Service layer LPAD()s the integer to 5 chars so IVR + sticker
--    renderer keep their fixed-width 5-glyph slot.
ALTER SEQUENCE qrdata_digits_auto_seq
  RESTART WITH 1
  MINVALUE 1
  MAXVALUE 10000
  NO CYCLE;

ALTER SEQUENCE qrdata_digits_manual_seq
  RESTART WITH 10001
  MINVALUE 10001
  MAXVALUE 90000
  NO CYCLE;

COMMIT;

-- ─── Sanity check (read-only) ────────────────────────────────────────
-- pg_sequences is the system view exposing min_value / max_value /
-- last_value for every sequence. Added in PG 10; present on every
-- supported version this project runs on.
SELECT
  sequencename,
  last_value,
  min_value,
  max_value
FROM pg_sequences
WHERE schemaname = 'public'
  AND sequencename IN (
    'qrdata_digits_auto_seq',
    'qrdata_digits_manual_seq'
  )
ORDER BY sequencename;
