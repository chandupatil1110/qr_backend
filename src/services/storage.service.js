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
  const base = STORAGE_BASE();
  const { bucket } = config.supabase;
  const endpoint = `${base}/object/upload/sign/${encodeURIComponent(bucket)}/${encodePath(objectPath)}`;

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
    return { error: `sign_request_failed: ${err.message}` };
  }
  const text = await res.text();
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  if (!res.ok) {
    const msg = payload?.message || payload?.error || payload?.raw || `HTTP ${res.status}`;
    return { error: String(msg).slice(0, 300) };
  }

  // `payload.url` is a relative path — turn it into an absolute URL the
  // browser can PUT to directly. `payload.token` is also returned so a
  // client using @supabase/storage-js uploadToSignedUrl() could use it —
  // we PUT the absolute URL from `signedUrl` in our own admin.html flow.
  const absoluteBase = (config.supabase.url || '').replace(/\/+$/, '');
  const signedUrl = payload.url
    ? (payload.url.startsWith('http') ? payload.url : `${absoluteBase}${payload.url.startsWith('/') ? '' : '/'}${payload.url}`)
    : null;
  if (!signedUrl) return { error: 'no_signed_url_returned' };

  return {
    signedUrl,
    token: payload.token || null,
    path: objectPath,
    publicUrl: publicUrlFor(objectPath),
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
