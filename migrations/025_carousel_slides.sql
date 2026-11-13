-- 025_carousel_slides.sql
--
-- Table that backs the home-screen image slider. The mobile app hits
-- GET /api/app/carousel, which now reads from this table first and
-- falls back to the CAROUSEL_SLIDES_JSON env var (then hardcoded
-- defaults in app.routes.js) if the table is empty — so existing
-- deploys don't break when this migration lands.
--
-- Admin manages rows via /api/admin/carousel — see admin.routes.js.

CREATE TABLE IF NOT EXISTS carousel_slides (
  id            SERIAL PRIMARY KEY,
  tag           TEXT    NOT NULL DEFAULT '',
  title         TEXT    NOT NULL,
  subtitle      TEXT    NOT NULL DEFAULT '',
  image_url     TEXT    NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Filters + sort used by the public read path.
CREATE INDEX IF NOT EXISTS carousel_slides_active_order_idx
  ON carousel_slides (is_active, display_order, id);
