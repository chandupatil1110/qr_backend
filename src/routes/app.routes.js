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

router.get('/version-check', (req, res) => {
  const currentVersion = req.query.version;
  const latestVersion = '1.0.5';
  
  // Mismatch check (if version query parameter is empty, we default forceUpdate to false)
  const forceUpdate = currentVersion ? (currentVersion !== latestVersion) : false;

  return res.json({
    latestVersion,
    forceUpdate,
    updateMessage: forceUpdate ? "Please update app to continue" : "App is up to date",
    playStoreUrl: "https://play.google.com/store/apps/details?id=com.emergency.alert"
  });
});

export default router;
