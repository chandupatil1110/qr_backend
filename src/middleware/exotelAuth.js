import crypto from 'crypto';

// Shared-secret check for the endpoints Exotel calls (Passthru lookup and
// call-completion). Without it, anyone could call /exotel/lookup with
// every 5-digit code and harvest owners' and family members' phone
// numbers.
//
// Set EXOTEL_WEBHOOK_SECRET in the environment, then append it to BOTH
// URLs configured in the Exotel dashboard:
//
//   https://api.qr4emergency.com/exotel/lookup?key=<secret>&digits=...
//   https://api.qr4emergency.com/api/exotel/call-completion?key=<secret>
//
// The key can also be sent as an `X-Webhook-Key` header.
//
// If EXOTEL_WEBHOOK_SECRET is NOT set, requests are allowed and a warning
// is logged. This keeps live emergency calls working between deploying
// this code and updating the Exotel URLs. Set the variable as soon as the
// Exotel URLs carry the key — until then the endpoints are still open.

let warnedMissing = false;

function safeEqual(a, b) {
  const A = Buffer.from(String(a), 'utf8');
  const B = Buffer.from(String(b), 'utf8');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

export function requireExotelKey(req, res, next) {
  const secret = (process.env.EXOTEL_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    if (!warnedMissing) {
      warnedMissing = true;
      console.warn(
        '[SECURITY][exotel] EXOTEL_WEBHOOK_SECRET is not set — /exotel/lookup and ' +
        '/api/exotel/call-completion are OPEN to anyone. Set it and add ?key=<secret> to the Exotel URLs.'
      );
    }
    return next();
  }
  const provided = req.query?.key ?? req.headers['x-webhook-key'];
  if (!provided || !safeEqual(provided, secret)) {
    console.warn(`[exotel/auth] REJECTED ${req.method} ${req.path} ip=${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return next();
}

/** Remove the `key` query param from a URL before it is logged. */
export function redactKeyParam(url) {
  return String(url).replace(/([?&]key=)[^&]*/gi, '$1[REDACTED]');
}
