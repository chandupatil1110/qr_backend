import dotenv from 'dotenv';

dotenv.config();

// Log only the DB host — full DATABASE_URL contains the password and
// Railway/Render logs are readable to anyone with dashboard access.
try {
  const u = new URL(process.env.DATABASE_URL || '');
  console.log(`[config] db host=${u.hostname} db=${u.pathname.replace(/^\//, '')}`);
} catch (_) {
  console.log('[config] db url not set');
}

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || 'dev-only-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  razorpayKeyId: process.env.RAZORPAY_KEY_ID,
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET,
  // Secret configured in Razorpay Dashboard → Settings → Webhooks. Used
  // to verify the X-Razorpay-Signature header on incoming webhook POSTs
  // so a third party can't forge payment.captured events. If unset, the
  // webhook endpoint accepts nothing — safer default than accepting
  // unsigned events.
  razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  publicAppUrl: (process.env.PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, ''),
  // SMTP config for transactional email (invoice on QR activation). All
  // values are optional at boot — if any are missing the mail service
  // silently no-ops. Gmail SMTP: host smtp.gmail.com, port 465, secure=true,
  // user=<inbox>, pass=<16-char app password> from Google account security.
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: parseInt(process.env.SMTP_PORT || '465', 10),
    secure: (process.env.SMTP_SECURE || 'true') !== 'false',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
  },
  invoice: {
    // Displayed on the invoice email — kept in one place so pricing changes
    // don't need a hunt through templates.
    amount: parseInt(process.env.INVOICE_AMOUNT || '299', 10),
    currency: process.env.INVOICE_CURRENCY || 'INR',
    company: process.env.INVOICE_COMPANY || 'CP Network Private Limited',
    companyAddress:
      process.env.INVOICE_COMPANY_ADDRESS ||
      'Bhagwan Nagar, Nagpur, Maharashtra 440027, India',
    companyEmail: process.env.INVOICE_COMPANY_EMAIL || 'support@cpnetwork.in',
    companyPhone: process.env.INVOICE_COMPANY_PHONE || '+91-9960049208',
  },
  // Renewal pricing. Kept separate from the first-year price (in
  // DEFAULT_AMOUNT_PAISE) so promotional or campaign renewal rates don't
  // affect new-QR purchases. Renewal is currently NOT surfaced to
  // customers — the product is a one-time purchase — but the config
  // and endpoints remain in case that changes.
  renewal: {
    amountPaise: parseInt(process.env.RENEWAL_AMOUNT_PAISE || '9900', 10),
  },
  // Line-item breakdown for the invoice email + payment screen. Sum
  // must equal DEFAULT_AMOUNT_PAISE (₹549). Split from the total so
  // the invoice shows Platform + Shipping as distinct line items —
  // matches how the price is advertised on the marketing page.
  pricing: {
    platformFeePaise: parseInt(process.env.PLATFORM_FEE_PAISE || '49900', 10),
    shippingFeePaise: parseInt(process.env.SHIPPING_FEE_PAISE || '5000', 10),
  },
  // Home-page promo video. Point PROMO_VIDEO_URL at any HTTPS MP4 (Supabase
  // Storage signed URL, S3, CloudFront, etc.). If unset, the app hides the
  // section — safe default for local dev.
  promoVideo: {
    url: process.env.PROMO_VIDEO_URL || '',
    title: process.env.PROMO_VIDEO_TITLE || 'See how it works',
    subtitle:
      process.env.PROMO_VIDEO_SUBTITLE ||
      'A 60-second walkthrough of QR 4 Emergency.',
    poster: process.env.PROMO_VIDEO_POSTER || '',
  },
  // Firebase Admin service-account JSON. Paste the entire JSON downloaded
  // from Firebase Console → Project Settings → Service accounts as a
  // single-line string in the env var. If unset, push notifications
  // silently no-op (DB rows still land in `notifications`).
  firebaseServiceAccount: process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '',
  // Exotel SMS credentials. When SMS_PROVIDER=exotel, all five values
  // below are required — the send helper fails closed (logs + no send)
  // if any is missing so we don't fire raw SMS with a broken header.
  //   sid       — Account SID (Exotel Dashboard → Settings)
  //   apiKey    — API key used as HTTP Basic username
  //   apiToken  — API token used as HTTP Basic password
  //   sender    — DLT-approved 6-char header e.g. "CPNETW"
  //   entityId  — DLT Principal Entity ID (required by Airtel/Jio/VI)
  //   subdomain — regional API host, "api.in.exotel.com" for India
  //
  // stripWs() removes ALL whitespace (including internal newlines).
  // Render's env editor wraps long strings visually; if a value gets
  // pasted with an accidental newline in the middle, .trim() wouldn't
  // catch it and HTTP Basic auth would silently fail with 401. Exotel
  // ids/keys/tokens never legitimately contain whitespace, so stripping
  // it out defensively is safe.
  exotel: (() => {
    const stripWs = (s) => (s || '').replace(/\s+/g, '');
    return {
      sid: stripWs(process.env.EXOTEL_SID),
      apiKey: stripWs(process.env.EXOTEL_API_KEY),
      apiToken: stripWs(process.env.EXOTEL_API_TOKEN),
      sender: stripWs(process.env.EXOTEL_SENDER) || 'CPNETW',
      entityId: stripWs(process.env.EXOTEL_DLT_ENTITY_ID),
      subdomain: stripWs(process.env.EXOTEL_SUBDOMAIN) || 'api.in.exotel.com',
    };
  })(),
};

export function assertConfig() {
  // "Prod-like" = anything that isn't a local developer laptop. On
  // Railway/Render both NODE_ENV=production AND the presence of the
  // hosting platform's own env vars indicate prod. This catches the
  // dangerous case of deploying with NODE_ENV=development left in the
  // committed .env — otherwise every safeguard below silently passes.
  const isProdLike =
    process.env.NODE_ENV === 'production' ||
    !!process.env.RAILWAY_ENVIRONMENT ||
    !!process.env.RENDER ||
    !!process.env.RENDER_SERVICE_ID ||
    !!process.env.FLY_APP_NAME ||
    !!process.env.HEROKU_APP_NAME;

  if (!config.databaseUrl && isProdLike) {
    throw new Error('DATABASE_URL is required in production');
  }
  if (!config.databaseUrl) {
    console.warn('Warning: DATABASE_URL not set. Database operations will fail.');
  }
  // Refuse to boot with the dev-only JWT secret in production — otherwise
  // an env var typo silently signs tokens with a public string and anyone
  // can forge admin tokens.
  if (isProdLike) {
    // Trim so a paste-with-trailing-space in the Railway/Render env
    // editor doesn't get flagged as a different-but-still-weak value.
    // These platforms preserve whatever whitespace you paste in.
    const secret = (process.env.JWT_SECRET || '').trim();
    // Common weak values that would boot without complaint but are
    // effectively public. Reject any of them, plus anything under 32
    // characters (well below the strength of an HMAC-SHA256 key).
    const WEAK = new Set([
      '', 'dev-only-change-me', 'your-secret-key-change-this',
      'secret', 'changeme', 'change-me',
    ]);
    // Diagnostic fingerprint so you can see WHY the guard fired without
    // ever printing the actual secret value. Prints length + first-4 +
    // last-4 characters.
    const fp = secret
      ? `len=${secret.length} fp=${secret.slice(0, 4)}…${secret.slice(-4)}`
      : 'MISSING (empty or unset)';
    if (!secret) {
      throw new Error(
        `JWT_SECRET is empty in this process. ` +
          `Railway/Render env vars are set on the platform dashboard — ` +
          `not read from the .env file in the repo. ` +
          `Set JWT_SECRET on the platform Variables tab to a random ` +
          `≥32-char string (e.g. \`openssl rand -hex 32\`).`
      );
    }
    if (WEAK.has(secret)) {
      throw new Error(
        `JWT_SECRET matches a known weak/placeholder value (${fp}). ` +
          `Set it to a random ≥32-char string (e.g. \`openssl rand -hex 32\`).`
      );
    }
    if (secret.length < 32) {
      throw new Error(
        `JWT_SECRET is too short — ${fp}. Needs to be at least 32 chars. ` +
          `Generate one with \`openssl rand -hex 32\`.`
      );
    }
    console.log(`[config] JWT_SECRET loaded ok (${fp})`);
  }

  // DEV_STATIC_OTP + TEST_CHARGE_AMOUNT_PAISE + ALLOW_FAKE_PAYMENT used
  // to be bypass paths. All three code paths were fully removed — the
  // env vars are now no-ops. If they're still set on a hosted deploy,
  // warn but don't block boot (blocking would just interrupt users for
  // a config-hygiene issue with zero security consequence).
  const deadEnvVars = [
    'DEV_STATIC_OTP',
    'TEST_CHARGE_AMOUNT_PAISE',
    'ALLOW_FAKE_PAYMENT',
  ].filter((k) => process.env[k]);
  if (deadEnvVars.length) {
    console.warn(
      `[config] These env vars are set but the code paths behind them ` +
        `have been removed — they do nothing now: ${deadEnvVars.join(', ')}. ` +
        `Delete them from your Railway/Render env config to reduce clutter.`
    );
  }

  // Renewal amount sanity check. Below 100 paise (₹1) is Razorpay's own
  // minimum; anything less would 400 at order-create time. Catch it at
  // boot so a typo in RENEWAL_AMOUNT_PAISE doesn't only surface when a
  // real customer tries to renew.
  if (!Number.isFinite(config.renewal.amountPaise) || config.renewal.amountPaise < 100) {
    throw new Error(
      `RENEWAL_AMOUNT_PAISE=${config.renewal.amountPaise} is below Razorpay minimum (100 paise / ₹1)`
    );
  }
}
