import { Router } from 'express';
import { config } from '../config/index.js';
import { pool } from '../db/pool.js';

const router = Router();

// Home-page promo/ad video metadata. Reads from promo_video table first
// (admin-managed); falls back to the PROMO_VIDEO_* env vars so a plain
// deploy with no admin-set video still works. Returns `{ url: null }`
// when neither source has a value — the mobile client hides the section
// on that response.
router.get('/promo-video', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT url, title, subtitle FROM promo_video WHERE id = 1`
    );
    const row = r.rows[0];
    const dbUrl = row && row.url ? String(row.url).trim() : '';
    if (dbUrl) {
      return res.json({
        url: dbUrl,
        title: row.title || 'See how it works',
        subtitle: row.subtitle || '',
        poster: null,
      });
    }
  } catch (err) {
    // Never fail this endpoint — the mobile home tab retries in a loop
    // if it 500s. Log and fall through to env-var config.
    console.warn('[app/promo-video] db read failed, falling back to env:', err.message);
  }

  const v = config.promoVideo || {};
  const url = String(v.url || '').trim();
  if (!url) {
    return res.json({ url: null });
  }
  return res.json({
    url,
    title: v.title || 'See how it works',
    subtitle: v.subtitle || '',
    poster: v.poster || null,
  });
});

// Home-screen carousel. Returns { items: [{tag, title, subtitle, imageUrl}] }.
// Slides come from the admin-managed carousel_slides table. The env JSON
// (CAROUSEL_SLIDES_JSON) is kept as an operator escape hatch for emergency
// pushes without touching the DB. When neither is set, we return an empty
// list and the mobile client simply hides the carousel until admin uploads
// something — no bundled stock photos.
function sanitizedCarouselItems(raw) {
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const cleaned = raw
    .slice(0, 10)
    .filter((s) => s && typeof s === 'object' && s.imageUrl)
    .map((s) => ({
      tag: String(s.tag || ''),
      title: String(s.title || ''),
      subtitle: String(s.subtitle || ''),
      imageUrl: String(s.imageUrl),
    }));
  return cleaned.length ? cleaned : null;
}

router.get('/carousel', async (req, res) => {
  // Preferred source: carousel_slides table (admin-managed). On empty
  // table or DB error we fall through to the env escape hatch, and
  // ultimately to an empty list — the mobile client hides the carousel
  // in that case so users never see stale bundled stock photos.
  try {
    const dbRes = await pool.query(
      `SELECT tag, title, subtitle, image_url
         FROM carousel_slides
        WHERE is_active = true
        ORDER BY display_order ASC, id ASC`
    );
    if (dbRes.rows.length) {
      const items = dbRes.rows.map((r) => ({
        tag: r.tag || '',
        title: r.title,
        subtitle: r.subtitle || '',
        imageUrl: r.image_url,
      }));
      return res.json({ items });
    }
  } catch (err) {
    console.warn('[app/carousel] db read failed, falling back to env:', err.message);
  }

  const envRaw = String(config.carouselSlidesJson || '').trim();
  if (envRaw) {
    try {
      const parsed = JSON.parse(envRaw);
      const items = sanitizedCarouselItems(parsed);
      if (items) return res.json({ items });
    } catch (err) {
      console.warn('[app/carousel] CAROUSEL_SLIDES_JSON parse failed:', err.message);
    }
  }
  return res.json({ items: [] });
});

// Semver-style compare. Returns -1 / 0 / 1 for a<b / a==b / a>b. Treats
// missing or malformed input as 0.0.0, so unknown clients will trigger
// the hardest fallback path (forceUpdate true if minSupported is set).
function compareVersions(a, b) {
  const pa = String(a || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '0').split('.').map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na < nb) return -1;
    if (na > nb) return 1;
  }
  return 0;
}

// Version-check: distinguishes a HARD force-update (client older than the
// minimum we still support) from a SOFT nudge (client older than the
// latest Play Store build but still within the supported window). The
// mobile client blocks the UI only when `forceUpdate` is true; otherwise
// it shows a dismissible banner on Home.
//
// Tuning knobs for the next release:
//   • Bump LATEST_VERSION to the version you're uploading to Play Store.
//   • Bump MIN_SUPPORTED_VERSION only when you need to cut off older
//     clients (schema break, security fix, retired API, etc).
router.get('/version-check', (req, res) => {
  const LATEST_VERSION = '1.0.5';
  const MIN_SUPPORTED_VERSION = '1.0.5';
  const PLAY_STORE_URL =
    'https://play.google.com/store/apps/details?id=com.cpnetwork.qr4emergency';

  const clientVersion = String(req.query.version || '').trim();
  // When the client didn't send a version at all (older build, missed the
  // query param, non-mobile caller), skip the gate — being wrong here
  // would lock legitimate users out.
  const hasClient = clientVersion.length > 0;

  const forceUpdate =
    hasClient && compareVersions(clientVersion, MIN_SUPPORTED_VERSION) < 0;
  const updateAvailable =
    hasClient && compareVersions(clientVersion, LATEST_VERSION) < 0;

  let updateMessage;
  if (forceUpdate) {
    updateMessage = 'This version is no longer supported. Please update to continue.';
  } else if (updateAvailable) {
    updateMessage = 'A new version is available with the latest features.';
  } else {
    updateMessage = 'App is up to date';
  }

  return res.json({
    latestVersion: LATEST_VERSION,
    minSupportedVersion: MIN_SUPPORTED_VERSION,
    forceUpdate,
    updateAvailable,
    updateMessage,
    playStoreUrl: PLAY_STORE_URL,
  });
});

export default router;
