import { config } from '../config/index.js';

// Supabase Storage helpers backed by direct REST calls (not the JS SDK).
//
// Why: @supabase/supabase-js v2 initializes a Realtime WebSocket client
// inside createClient(), and Realtime requires either Node 22+ (native
// WebSocket) or a manually-injected `ws` transport. Railway runs Node 18,
// so importing the SDK crashes the process on the first createClient()
// call. We only need Storage endpoints — create-signed-upload-url, list,
// delete, and the deterministic public URL — so a fetch()-based wrapper
// is simpler, lighter, and Node-version-agnostic.

const STORAGE_BASE = () => {
  const base = (config.supabase.url || '').replace(/\/+$/, '');
  return base ? `${base}/storage/v1` : '';
};

const authHeaders = () => {
  const key = config.supabase.serviceRoleKey;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
};

// Mask the service-role JWT before logging — it's a bearer credential, so
// anything that ends up in logs needs to be redacted. Shape like
// "eyJhbGc...JGY0 (len=219)" keeps enough signal to tell "key is loaded"
// apart from "key missing / truncated" without leaking the full token.
function maskKey(key) {
  if (!key) return '<missing>';
  const len = key.length;
  if (len <= 10) return `<short len=${len}>`;
  return `${key.slice(0, 6)}...${key.slice(-4)} (len=${len})`;
}

// Log the resolved supabase env once per process. Fires lazily on the
// first Storage call so boot-time logs stay clean for deploys that never
// touch Supabase (local dev without SUPABASE_URL set, etc.).
let _configLogged = false;
function logStorageConfigOnce() {
  if (_configLogged) return;
  _configLogged = true;
  const { url, serviceRoleKey, bucket } = config.supabase;
  console.log(
    `[storage] config: SUPABASE_URL=${url || '<missing>'} ` +
      `SUPABASE_BUCKET=${bucket || '<missing>'} ` +
      `SUPABASE_SERVICE_ROLE_KEY=${maskKey(serviceRoleKey)} ` +
      `configured=${Boolean(url && serviceRoleKey && bucket)}`
  );
}

export function storageConfigured() {
  const { url, serviceRoleKey, bucket } = config.supabase;
  return Boolean(url && serviceRoleKey && bucket);
}

function encodePath(path) {
  return path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

// Cache the "bucket exists" answer so we don't hit /storage/v1/bucket on
// every single upload. Reset if the caller passes a different bucket name
// (env-var change without a container restart is unusual but possible).
let _bucketReady = { name: null, ok: false };

// Idempotent: make sure the configured bucket exists and is public.
// Called before every signed-upload request so a fresh Supabase project
// (no manually-created bucket) still works end-to-end. Returns
// { ok: true } on success, { ok: false, error } otherwise — the caller
// surfaces the message so the admin can see WHY it failed instead of
// getting Supabase's opaque "The related resource does not exist".
export async function ensureBucket() {
  logStorageConfigOnce();
  const base = STORAGE_BASE();
  const { bucket } = config.supabase;
  const cached = _bucketReady.name === bucket && _bucketReady.ok;
  console.log(
    `[storage] ensureBucket start: bucket="${bucket || '<missing>'}" base="${base || '<missing>'}" cached=${cached}`
  );

  if (!storageConfigured()) {
    console.warn('[storage] ensureBucket → storage_not_configured (one of SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY/SUPABASE_BUCKET is empty)');
    return { ok: false, error: 'storage_not_configured' };
  }

  if (cached) {
    return { ok: true };
  }

  // 1. Does the bucket already exist?
  const lookupUrl = `${base}/bucket/${encodeURIComponent(bucket)}`;
  const startedAt = Date.now();
  try {
    console.log(`[storage] bucket GET → ${lookupUrl}`);
    const res = await fetch(lookupUrl, { headers: authHeaders() });
    const elapsedMs = Date.now() - startedAt;
    console.log(`[storage] bucket GET ← HTTP ${res.status} in ${elapsedMs}ms`);
    if (res.ok) {
      _bucketReady = { name: bucket, ok: true };
      console.log(`[storage] bucket "${bucket}" ready (lookup ok)`);
      return { ok: true };
    }
    if (res.status !== 404 && res.status !== 400) {
      // Auth failure (401/403) means the service_role_key is wrong or the
      // URL/key are from different projects. Surface with the exact
      // status so the admin can act on it.
      const text = await res.text().catch(() => '');
      console.error(
        `[storage] bucket lookup non-OK HTTP ${res.status}. url=${lookupUrl} body="${text.slice(0, 200)}"`
      );
      return {
        ok: false,
        error: `Supabase bucket lookup failed (HTTP ${res.status}). ` +
          `Check SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY point to the SAME project. ${text.slice(0, 200)}`,
      };
    }
    console.log(`[storage] bucket lookup → ${res.status} (bucket not found yet, will create)`);
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    // `fetch failed` with no HTTP status means Node couldn't even get a
    // response — usually a bad SUPABASE_URL, paused project, or DNS
    // failure. Logging the URL (without the key) makes this diagnosable
    // from Railway logs instead of a generic "fetch failed" message.
    console.error(
      `[storage] bucket lookup threw before a response. url=${lookupUrl} elapsed=${elapsedMs}ms err=${err.message} cause=${err?.cause?.code || err?.cause?.message || '<none>'}`
    );
    const hint = /invalid url|invalid-url/i.test(err.message)
      ? 'SUPABASE_URL is malformed'
      : /ENOTFOUND|getaddrinfo/i.test(err.message) || /ENOTFOUND|getaddrinfo/i.test(err?.cause?.code || '')
      ? `DNS could not resolve ${base} — SUPABASE_URL is wrong or the project is paused`
      : 'SUPABASE_URL is unreachable (typo, paused project, or network outage)';
    return {
      ok: false,
      error: `bucket_lookup_failed: ${err.message} — ${hint}`,
    };
  }

  // 2. Bucket doesn't exist — create it public so the getPublicUrl()
  //    string we hand to the mobile player is actually readable. Lock
  //    the allowed mime types to videos so a bad upload can't stuff
  //    random data in here. Deliberately do NOT set file_size_limit:
  //    Supabase rejects the create with 413 if the requested limit
  //    exceeds the project's Global upload file size limit, and that
  //    global cap varies by plan (Free 50MB, Pro 5GB, custom). Letting
  //    the bucket inherit the project default sidesteps that mismatch.
  //    Per-upload size is guarded client-side in admin.html.
  const createUrl = `${base}/bucket`;
  const createStartedAt = Date.now();
  try {
    console.log(`[storage] bucket POST → ${createUrl} body.id="${bucket}"`);
    const res = await fetch(createUrl, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: bucket,
        name: bucket,
        public: true,
        allowed_mime_types: ['video/mp4', 'video/webm', 'video/quicktime'],
      }),
    });
    const elapsedMs = Date.now() - createStartedAt;
    console.log(`[storage] bucket POST ← HTTP ${res.status} in ${elapsedMs}ms`);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      // 409 (already exists) is fine — race between two admin uploads.
      if (res.status === 409) {
        console.log(`[storage] bucket "${bucket}" already exists (409 race) — marking ready`);
        _bucketReady = { name: bucket, ok: true };
        return { ok: true };
      }
      console.error(`[storage] bucket create failed HTTP ${res.status}: ${text.slice(0, 200)}`);
      return {
        ok: false,
        error: `Supabase bucket create failed (HTTP ${res.status}): ${text.slice(0, 200)}`,
      };
    }
    _bucketReady = { name: bucket, ok: true };
    console.log(`[storage] bucket "${bucket}" created (public)`);
    return { ok: true };
  } catch (err) {
    console.error(`[storage] bucket create threw: url=${createUrl} err=${err.message} cause=${err?.cause?.code || err?.cause?.message || '<none>'}`);
    return { ok: false, error: `bucket_create_failed: ${err.message}` };
  }
}

// Ask Supabase for a short-lived URL the browser can PUT a file directly
// to — skips our backend entirely for the file bytes. Response shape from
// the REST API: { url: "/object/upload/sign/{bucket}/{path}?token=…",
// token: "…" }. We resolve `url` against SUPABASE_URL so the caller gets
// a fully-qualified URL back.
export async function createSignedUploadUrl(objectPath) {
  if (!storageConfigured()) {
    return {
      error:
        'Storage not configured — set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET',
    };
  }

  // Make sure the bucket exists before we ask Supabase to sign an upload
  // URL into it. Without this a missing bucket surfaces as Supabase's
  // opaque "The related resource does not exist" — the admin has no
  // clue that means "create a bucket named X in your project".
  const ready = await ensureBucket();
  if (!ready.ok) {
    return { error: ready.error };
  }

  const base = STORAGE_BASE();
  const { bucket } = config.supabase;
  const endpoint = `${base}/object/upload/sign/${encodeURIComponent(bucket)}/${encodePath(objectPath)}`;

  console.log(`[storage] sign POST → ${endpoint}`);
  const signStartedAt = Date.now();
  let res;
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  } catch (err) {
    console.error(`[storage] sign request threw: endpoint=${endpoint} err=${err.message} cause=${err?.cause?.code || err?.cause?.message || '<none>'}`);
    return { error: `sign_request_failed: ${err.message}` };
  }
  const elapsedMs = Date.now() - signStartedAt;
  const text = await res.text();
  console.log(`[storage] sign POST ← HTTP ${res.status} in ${elapsedMs}ms bytes=${text.length}`);
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!res.ok) {
    const msg = payload?.message || payload?.error || payload?.raw || `HTTP ${res.status}`;
    console.error(`[storage] sign non-OK: HTTP ${res.status} msg="${String(msg).slice(0, 200)}"`);
    // If Supabase still complains about a missing resource here (rare —
    // ensureBucket() just confirmed it), invalidate the cache so the
    // next call re-checks + re-creates instead of trusting a stale yes.
    if (String(msg).toLowerCase().includes('does not exist')) {
      console.warn('[storage] "does not exist" from sign — invalidating bucket cache so next call re-ensures');
      _bucketReady = { name: null, ok: false };
    }
    return { error: String(msg).slice(0, 300) };
  }

  // `payload.url` is a relative path served by the STORAGE service —
  // e.g. "/object/upload/sign/promo/foo.mp4?token=...". To turn it into
  // an absolute URL the browser can PUT to, we prepend the storage base
  // (https://<project>.supabase.co/storage/v1), NOT the bare project URL.
  // Prepending just the project URL drops the "/storage/v1" prefix, and
  // Supabase's CDN responds 404 to the CORS preflight on that shorter
  // path — the file never uploads. `payload.token` is also returned so a
  // client using @supabase/storage-js uploadToSignedUrl() could use it —
  // we PUT the absolute URL from `signedUrl` in our own admin.html flow.
  const storageBase = STORAGE_BASE();
  const signedUrl = payload.url
    ? (payload.url.startsWith('http')
        ? payload.url
        : `${storageBase}${payload.url.startsWith('/') ? '' : '/'}${payload.url}`)
    : null;
  if (!signedUrl) {
    console.error(`[storage] sign returned 2xx but payload.url was empty: payload=${JSON.stringify(payload).slice(0, 200)}`);
    return { error: 'no_signed_url_returned' };
  }

  const publicUrl = publicUrlFor(objectPath);
  console.log(`[storage] sign ok: bucket="${bucket}" path="${objectPath}" publicUrl=${publicUrl}`);
  return {
    signedUrl,
    token: payload.token || null,
    path: objectPath,
    publicUrl,
    bucket,
  };
}

// Check the object exists in the bucket. Uses the storage list endpoint
// filtered by prefix + search — cheap, no bytes pulled.
export async function objectExists(objectPath) {
  if (!storageConfigured() || !objectPath) return false;
  const base = STORAGE_BASE();
  const { bucket } = config.supabase;
  const slash = objectPath.lastIndexOf('/');
  const prefix = slash >= 0 ? objectPath.slice(0, slash) : '';
  const name = slash >= 0 ? objectPath.slice(slash + 1) : objectPath;

  let res;
  try {
    res = await fetch(`${base}/object/list/${encodeURIComponent(bucket)}`, {
      method: 'POST',
      headers: {
        ...authHeaders(),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefix, limit: 100, search: name }),
    });
  } catch (err) {
    console.warn('[storage] objectExists fetch failed:', err.message);
    return false;
  }
  if (!res.ok) return false;
  const list = await res.json().catch(() => []);
  if (!Array.isArray(list)) return false;
  return list.some((entry) => entry && entry.name === name);
}

// Public URL is deterministic when the bucket is set to public. No API
// call needed — construct it ourselves so callers don't pay a round trip.
export function publicUrlFor(objectPath) {
  if (!storageConfigured() || !objectPath) return null;
  const base = (config.supabase.url || '').replace(/\/+$/, '');
  const { bucket } = config.supabase;
  return `${base}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodePath(objectPath)}`;
}

// Delete an object. Best-effort — callers use this to clean up the
// previous promo video after uploading a new one; a failure here is
// logged but never blocks the caller.
export async function removeObject(objectPath) {
  if (!storageConfigured() || !objectPath) {
    return { ok: false, error: 'no_client_or_path' };
  }
  const base = STORAGE_BASE();
  const { bucket } = config.supabase;
  let res;
  try {
    res = await fetch(
      `${base}/object/${encodeURIComponent(bucket)}/${encodePath(objectPath)}`,
      { method: 'DELETE', headers: authHeaders() }
    );
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { ok: false, error: `HTTP ${res.status} ${text}`.slice(0, 200) };
  }
  return { ok: true };
}

// Kept for API compatibility with previous version — the admin flow no
// longer buffers bytes on the backend, but a caller that wants to push
// a small buffer can still use this. Uses the storage upload endpoint
// directly (no SDK). Not exercised by the promo-video flow anymore.
export async function uploadObject({ buffer, objectPath, contentType }) {
  if (!storageConfigured()) {
    return { error: 'storage_not_configured' };
  }
  const base = STORAGE_BASE();
  const { bucket } = config.supabase;
  let res;
  try {
    res = await fetch(
      `${base}/object/${encodeURIComponent(bucket)}/${encodePath(objectPath)}`,
      {
        method: 'POST',
        headers: {
          ...authHeaders(),
          'Content-Type': contentType || 'application/octet-stream',
          'x-upsert': 'true',
        },
        body: buffer,
      }
    );
  } catch (err) {
    return { error: err.message };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { error: `HTTP ${res.status} ${text}`.slice(0, 200) };
  }
  return { url: publicUrlFor(objectPath), path: objectPath, bucket };
}
