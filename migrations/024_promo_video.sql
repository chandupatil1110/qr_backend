-- Migration 024 — promo_video single-row config table.
--
-- Backs the home-tab promo/ad video slot. Admin uploads a file via the
-- admin panel; the video is pushed to Supabase Storage (or S3-compatible)
-- and the resulting public URL is written here. GET /api/app/promo-video
-- reads this row (falls back to the PROMO_VIDEO_URL env var if empty).
--
-- Single-row pattern (id = 1 always) keeps the "one active ad at a time"
-- invariant at the schema level — a stray INSERT can't create a second
-- row, so the app never has to pick between multiple rows.

CREATE TABLE IF NOT EXISTS promo_video (
  id           INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  url          TEXT,
  title        TEXT,
  subtitle     TEXT,
  storage_path TEXT,           -- Supabase bucket/object path for later delete
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed the row so upsert-by-id in the API can always update in place.
INSERT INTO promo_video (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;
