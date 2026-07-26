import { createClient } from '@supabase/supabase-js';
import { config } from '../config/index.js';

// Thin wrapper over Supabase Storage. Callers hand in a Buffer + a
// destination path; we upload to the configured bucket and return the
// public URL. `upload` and `remove` both fail closed with a helpful
// message when the Supabase creds are missing — nothing here throws
// unless the Supabase SDK itself does.

let _client = null;

function getClient() {
  const { url, serviceRoleKey } = config.supabase;
  if (!url || !serviceRoleKey) return null;
  if (_client) return _client;
  _client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return _client;
}

export function storageConfigured() {
  const { url, serviceRoleKey, bucket } = config.supabase;
  return Boolean(url && serviceRoleKey && bucket);
}

// Ask Supabase for a short-lived URL the browser can PUT a file directly
// to — skips our backend entirely for the file bytes. Solves the 200MB-
// through-Railway-edge problem: signing is a millisecond RPC, the actual
// bytes never touch our container. Returns { signedUrl, path, token,
// publicUrl } — the browser uploads with PUT, then we POST /commit with
// the path to record the resulting publicUrl in the DB.
export async function createSignedUploadUrl(objectPath) {
  const client = getClient();
  if (!client) {
    return {
      error:
        'Storage not configured — set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET',
    };
  }
  const { bucket } = config.supabase;
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUploadUrl(objectPath);
  if (error || !data) {
    return { error: (error && error.message) || 'sign_failed' };
  }
  const pub = client.storage.from(bucket).getPublicUrl(objectPath);
  return {
    signedUrl: data.signedUrl,
    token: data.token,
    path: data.path || objectPath,
    publicUrl: pub?.data?.publicUrl || null,
    bucket,
  };
}

// Confirm the object exists at the path before we write its URL to the
// DB. Cheap HEAD-like call via list() with a prefix filter — no bytes
// pulled.
export async function objectExists(objectPath) {
  const client = getClient();
  if (!client || !objectPath) return false;
  const { bucket } = config.supabase;
  const slash = objectPath.lastIndexOf('/');
  const prefix = slash >= 0 ? objectPath.slice(0, slash) : '';
  const name = slash >= 0 ? objectPath.slice(slash + 1) : objectPath;
  const { data, error } = await client.storage.from(bucket).list(prefix, {
    limit: 100,
    search: name,
  });
  if (error || !Array.isArray(data)) return false;
  return data.some((entry) => entry && entry.name === name);
}

export function publicUrlFor(objectPath) {
  const client = getClient();
  if (!client || !objectPath) return null;
  const { bucket } = config.supabase;
  const { data } = client.storage.from(bucket).getPublicUrl(objectPath);
  return data?.publicUrl || null;
}

// Upload a buffer to `<bucket>/<objectPath>`. Returns { url, path } on
// success or { error } on failure. `upsert: true` so re-uploading the
// same path overwrites the old object (matches the "one active promo
// video" invariant enforced by the DB).
export async function uploadObject({ buffer, objectPath, contentType }) {
  const client = getClient();
  if (!client) {
    return {
      error:
        'Storage not configured — set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_BUCKET',
    };
  }
  const { bucket } = config.supabase;
  const { error: uploadErr } = await client.storage
    .from(bucket)
    .upload(objectPath, buffer, {
      contentType: contentType || 'application/octet-stream',
      upsert: true,
    });
  if (uploadErr) {
    return { error: uploadErr.message || 'upload_failed' };
  }
  const { data } = client.storage.from(bucket).getPublicUrl(objectPath);
  if (!data || !data.publicUrl) {
    return { error: 'no_public_url' };
  }
  return { url: data.publicUrl, path: objectPath, bucket };
}

// Delete an object by path. No-op (with a warn) when storage isn't
// configured — the caller (admin promo-video delete) still wants to
// clear the DB row even if we can't reach Supabase.
export async function removeObject(objectPath) {
  const client = getClient();
  if (!client || !objectPath) return { ok: false, error: 'no_client_or_path' };
  const { bucket } = config.supabase;
  const { error } = await client.storage.from(bucket).remove([objectPath]);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
