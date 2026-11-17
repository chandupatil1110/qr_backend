import jwt from 'jsonwebtoken';
import { randomBytes, randomInt, createHash, timingSafeEqual } from 'crypto';
import { pool } from '../db/pool.js';
import { config } from '../config/index.js';

// 10 minutes to match the DLT-approved LOGIN_OTP template body
// ("It is valid for 10 minutes"). Changing this without re-registering
// the template on DLT would leave users staring at "OTP expired" between
// minutes 5-10 while the SMS promised 10.
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;
// Per-mobile caps on how many OTPs can be issued. With a 4-digit code and
// 5 tries per code, these bound a guessing attacker to ~25 guesses/hour
// and ~50/day per number (≈0.5% chance/day), and stop SMS flooding of
// one number. Moving to a 6-digit OTP (needs an app update — the OTP
// screen has 4 boxes) would cut that chance by another 100x.
const MAX_OTPS_PER_HOUR = 5;
const MAX_OTPS_PER_DAY = 10;

/**
 * Normalise a login mobile to the 10-digit form the app and renew page
 * send ("9876543210"), so "+91 98765 43210", "919876543210" and
 * "09876543210" all map to the same account. Returns null if it isn't a
 * valid Indian mobile.
 */
export function normalizeLoginMobile(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
}

// Play Store review credential. Google's review team can't receive our
// SMS OTP (no real SIM), so this fixed pair bypasses issue+verify. Keep
// the mobile number here in sync with what's submitted in the Play
// Console review form. Do NOT share this pair outside of the Play
// listing — anyone with it can log in as this user.
const REVIEW_MOBILE = '9665108102';
const REVIEW_OTP = '9876';

export async function findOrCreateUserByMobile(mobile) {
  const existing = await pool.query('SELECT * FROM users WHERE mobile = $1', [mobile]);
  if (existing.rows.length) return existing.rows[0];
  const inserted = await pool.query(
    `INSERT INTO users (mobile) VALUES ($1) RETURNING *`,
    [mobile]
  );
  return inserted.rows[0];
}

export function issueToken(userId) {
  return jwt.sign({ sub: String(userId) }, config.jwtSecret, { expiresIn: config.jwtExpiresIn });
}

// Per-record salt makes rainbow tables useless despite the tiny 10k code
// space. We're not using bcrypt here — the throughput cost isn't worth
// it when rate limiting + attempt cap already bound the attacker.
function hashOtp(otp, salt) {
  return createHash('sha256').update(String(salt) + String(otp)).digest('hex');
}

// Cheap idempotency guard so a fresh deploy that hasn't run migrations
// yet still works. Migration 019 also creates this schema; keeping it
// here means we never 500 with "relation login_otp does not exist" while
// waiting on `npm run migrate` to fire on Render.
let _loginOtpEnsured = false;
async function ensureLoginOtpTable(client) {
  if (_loginOtpEnsured) return;
  await client.query(`
    CREATE TABLE IF NOT EXISTS login_otp (
      id           SERIAL PRIMARY KEY,
      mobile       VARCHAR(20) NOT NULL,
      otp_hash     TEXT        NOT NULL,
      salt         TEXT        NOT NULL,
      expires_at   TIMESTAMPTZ NOT NULL,
      attempts     INT         NOT NULL DEFAULT 0,
      used_at      TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await client.query(`CREATE INDEX IF NOT EXISTS login_otp_mobile_idx ON login_otp(mobile);`);
  await client.query(`CREATE INDEX IF NOT EXISTS login_otp_expires_idx ON login_otp(expires_at);`);
  _loginOtpEnsured = true;
}

// Generates a 4-digit OTP, invalidates any prior codes for this mobile,
// and persists a fresh salted-hash row with a 10-minute TTL. Returns the
// PLAIN-TEXT OTP so the caller can pipe it to the SMS transport — never
// log this or return it to a client.
export async function issueLoginOtp(mobile) {
  // Play Store review number short-circuits SMS delivery. Return the
  // fixed review OTP so the route layer's SMS call is a no-op (console
  // provider logs it; live providers are gated on config anyway).
  if (String(mobile).trim() === REVIEW_MOBILE) {
    return REVIEW_OTP;
  }
  const client = await pool.connect();
  try {
    await ensureLoginOtpTable(client);
    await client.query('BEGIN');
    // Serialise issuing per mobile so the cap below can't be raced.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('login_otp:' || $1))`, [mobile]);
    const recent = await client.query(
      `SELECT COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '1 hour')::int AS hour,
              COUNT(*)::int AS day
         FROM login_otp
        WHERE mobile = $1 AND created_at > NOW() - INTERVAL '1 day'`,
      [mobile]
    );
    const { hour, day } = recent.rows[0];
    if (hour >= MAX_OTPS_PER_HOUR || day >= MAX_OTPS_PER_DAY) {
      await client.query('ROLLBACK');
      console.warn(`[auth/otp] issue cap hit mobile=…${String(mobile).slice(-4)} hour=${hour} day=${day}`);
      const err = new Error(
        hour >= MAX_OTPS_PER_HOUR
          ? 'Too many OTP requests — please try again in an hour'
          : 'Too many OTP requests today — please try again tomorrow'
      );
      err.statusCode = 429;
      throw err;
    }
    // Any outstanding unused OTPs for this mobile are marked as consumed
    // so only the newest code can be redeemed. Prevents a stale code
    // from working when the user re-requests.
    await client.query(
      `UPDATE login_otp
          SET used_at = NOW()
        WHERE mobile = $1 AND used_at IS NULL`,
      [mobile]
    );
    const otp = String(randomInt(0, 10000)).padStart(4, '0');
    const salt = randomBytes(16).toString('hex');
    const hash = hashOtp(otp, salt);
    const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
    await client.query(
      `INSERT INTO login_otp (mobile, otp_hash, salt, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [mobile, hash, salt, expiresAt]
    );
    await client.query('COMMIT');
    return otp;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Constant-time comparison so an attacker can't infer partial matches
// from response timing. Both inputs are hex-encoded hashes, same length.
function safeHexEquals(a, b) {
  const bufA = Buffer.from(String(a), 'hex');
  const bufB = Buffer.from(String(b), 'hex');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function verifyOtpAndLogin(mobile, otp) {
  const otpStr = String(otp || '').trim();
  if (!/^\d{4}$/.test(otpStr)) {
    const err = new Error('OTP must be 4 digits');
    err.statusCode = 400;
    throw err;
  }

  // Play Store review bypass. Fixed OTP for the fixed number — skips
  // DB lookup entirely so no login_otp row is required to exist.
  if (String(mobile).trim() === REVIEW_MOBILE && otpStr === REVIEW_OTP) {
    const user = await findOrCreateUserByMobile(REVIEW_MOBILE);
    const token = issueToken(user.id);
    return { user, token };
  }

  // Grab the most recent unused OTP for this mobile. Older ones were
  // already marked used by issueLoginOtp, so at most one row can win.
  const row = await pool.query(
    `SELECT id, otp_hash, salt, expires_at, attempts
       FROM login_otp
      WHERE mobile = $1 AND used_at IS NULL
      ORDER BY id DESC
      LIMIT 1`,
    [mobile]
  );
  if (!row.rows.length) {
    const err = new Error('No active OTP — please request a new code');
    err.statusCode = 400;
    throw err;
  }
  const record = row.rows[0];
  if (new Date(record.expires_at).getTime() < Date.now()) {
    // Mark it used so a repeat attempt hits "no active OTP" instead of
    // "expired" — same UX, avoids leaking whether an OTP ever existed.
    await pool.query(`UPDATE login_otp SET used_at = NOW() WHERE id = $1`, [record.id]);
    const err = new Error('OTP expired — please request a new code');
    err.statusCode = 400;
    throw err;
  }

  // Spend one attempt BEFORE comparing, atomically. A read-then-write
  // counter let many parallel guesses all see attempts=0 and skip the cap.
  const spent = await pool.query(
    `UPDATE login_otp
        SET attempts = attempts + 1
      WHERE id = $1 AND used_at IS NULL AND attempts < $2
      RETURNING attempts`,
    [record.id, MAX_ATTEMPTS]
  );
  if (!spent.rows.length) {
    await pool.query(`UPDATE login_otp SET used_at = COALESCE(used_at, NOW()) WHERE id = $1`, [record.id]);
    const err = new Error('Too many wrong attempts — request a new OTP');
    err.statusCode = 400;
    throw err;
  }
  const attemptsNow = spent.rows[0].attempts;

  const expectedHash = hashOtp(otpStr, record.salt);
  const ok = safeHexEquals(expectedHash, record.otp_hash);

  if (!ok) {
    // Past MAX_ATTEMPTS the row is invalidated so the attacker can't
    // keep guessing against the same code.
    if (attemptsNow >= MAX_ATTEMPTS) {
      await pool.query(`UPDATE login_otp SET used_at = NOW() WHERE id = $1`, [record.id]);
      const err = new Error('Too many wrong attempts — request a new OTP');
      err.statusCode = 400;
      throw err;
    }
    const err = new Error('Invalid OTP');
    err.statusCode = 400;
    throw err;
  }

  // Consume the code atomically so it can only log in once.
  const consumed = await pool.query(
    `UPDATE login_otp SET used_at = NOW() WHERE id = $1 AND used_at IS NULL RETURNING id`,
    [record.id]
  );
  if (!consumed.rows.length) {
    const err = new Error('No active OTP — please request a new code');
    err.statusCode = 400;
    throw err;
  }

  const user = await findOrCreateUserByMobile(mobile);
  const token = issueToken(user.id);
  return { user, token };
}
