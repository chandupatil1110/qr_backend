import crypto from 'crypto';
import Razorpay from 'razorpay';
import { config } from '../config/index.js';

let client;

function getClient() {
  if (!config.razorpayKeyId || !config.razorpayKeySecret) {
    return null;
  }
  if (!client) {
    client = new Razorpay({
      key_id: config.razorpayKeyId,
      key_secret: config.razorpayKeySecret,
    });
  }
  return client;
}

/** One-time subscription amount — ₹549 total in paise.
 *   Breakdown: platform fee ₹499 + shipping ₹50 = ₹549.
 *  This must equal (config.pricing.platformFeePaise + shippingFeePaise)
 *  and match the marketing copy on the home/subscription card and the
 *  Payment screen — any mismatch causes users to see different prices
 *  during checkout and abandon (real production incident, July 2026).
 *  There is no annual renewal — this is a one-time purchase for the
 *  lifetime of the customer's account. */
export const DEFAULT_AMOUNT_PAISE = 54900;
/** Razorpay's own minimum. Sending less returns 400 BAD_REQUEST_ERROR. */
export const MIN_AMOUNT_PAISE = 100;

export async function createOrder(
  amountPaise = DEFAULT_AMOUNT_PAISE,
  receipt = `rcpt_${Date.now()}`,
  intendedPaise = null,
) {
  // Amount validation — cheaper to fail here than after a network round trip.
  const requested = Number(amountPaise);
  if (!Number.isFinite(requested) || !Number.isInteger(requested)) {
    const err = new Error('Amount must be an integer number of paise');
    err.statusCode = 400;
    throw err;
  }
  if (requested < MIN_AMOUNT_PAISE) {
    const err = new Error(`Amount must be at least ${MIN_AMOUNT_PAISE} paise (₹1.00)`);
    err.statusCode = 400;
    throw err;
  }
  // Optional per-caller "intended amount" so a discounted charge can
  // still show the real price on the UI. Falls back to the actual
  // charge when the caller doesn't pass one.
  const intended = Number.isFinite(Number(intendedPaise))
    ? Number(intendedPaise)
    : requested;

  const rz = getClient();
  if (!rz) {
    const err = new Error('Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.');
    err.statusCode = 503;
    throw err;
  }
  // Structured entry log so every order creation is traceable in the
  // hosting logs — search for `[razorpay/order]` to see the full
  // lifecycle of any payment. `intended` != `requested` when a caller
  // routed the user through a discounted charge (e.g. whitelisted
  // internal test mobiles paying ₹1); both are logged for audit.
  console.log(
    `[razorpay/order] creating amount=${requested} intended=${intended} receipt=${receipt} live=${String(config.razorpayKeyId || '').startsWith('rzp_live_')}`
  );
  try {
    const order = await rz.orders.create({
      amount: requested,
      currency: 'INR',
      receipt,
      payment_capture: 1,
    });
    console.log(
      `[razorpay/order] created order_id=${order.id} amount=${order.amount} status=${order.status || 'unknown'}`
    );
    return { ...order, intended_amount: intended };
  } catch (err) {
    // Log the RAW Razorpay error before wrapping so we can see exactly
    // what the gateway said. Without this, our wrapped 502 hides the
    // real reason (bad key, wrong signature format, invalid currency,
    // account restrictions, etc.).
    console.error(
      '[razorpay/order] SDK call failed',
      JSON.stringify({
        upstream_status: err.statusCode || err.error?.status_code,
        code: err.error?.code,
        description: err.error?.description,
        reason: err.error?.reason,
        source: err.error?.source,
        step: err.error?.step,
        field: err.error?.field,
        raw_message: err.message,
      })
    );

    // Razorpay SDK exposes statusCode + error.description on API failures.
    // We map every upstream failure to 502 Bad Gateway — NEVER a 401 —
    // because a 401 back to the mobile client would trigger the
    // "session expired" handler and log the user out for something that
    // has nothing to do with their session (it's OUR server auth failing
    // to Razorpay). The response body carries the real cause so the
    // route handler can still log/surface it.
    const upstream = err.statusCode || err.error?.status_code;
    if (upstream === 401) {
      const e = new Error('Razorpay authentication failed on the server — check RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET on the backend');
      e.statusCode = 502;
      throw e;
    }
    if (upstream === 400) {
      const e = new Error(err.error?.description || err.message || 'Invalid Razorpay order payload');
      e.statusCode = 400;
      throw e;
    }
    const e = new Error(err.error?.description || err.message || 'Razorpay order creation failed');
    e.statusCode = 502;
    throw e;
  }
}

// Timing-safe HMAC compare so a hostile client can't measure response
// time to infer partial matches. Buffers must be the same length or
// timingSafeEqual throws — we normalize by explicit length check first.
function safeEqualHex(a, b) {
  const A = Buffer.from(String(a), 'utf8');
  const B = Buffer.from(String(b), 'utf8');
  if (A.length !== B.length) return false;
  return crypto.timingSafeEqual(A, B);
}

export function verifyPaymentSignature(orderId, paymentId, signature) {
  if (!config.razorpayKeySecret) {
    console.error(`[razorpay/verify] REJECTED — RAZORPAY_KEY_SECRET not configured order=${orderId}`);
    return false;
  }
  if (!orderId || !paymentId || !signature) {
    console.warn(`[razorpay/verify] REJECTED — missing field order=${orderId} payment=${paymentId} sig_present=${!!signature}`);
    return false;
  }
  // HMAC-SHA256(order_id + "|" + payment_id, KEY_SECRET) — Razorpay spec.
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', config.razorpayKeySecret)
    .update(body)
    .digest('hex');
  const ok = safeEqualHex(expected, signature);
  if (ok) {
    console.log(`[razorpay/verify] OK order=${orderId} payment=${paymentId}`);
  } else {
    console.error(
      `[razorpay/verify] SIGNATURE MISMATCH order=${orderId} payment=${paymentId} ` +
      `expected_prefix=${expected.slice(0, 12)}... got_prefix=${String(signature).slice(0, 12)}... ` +
      `— usually means the KEY_SECRET on this server doesn't match the one that created the order`
    );
  }
  return ok;
}
