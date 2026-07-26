const STATE_SCHEMA = `CREATE TABLE IF NOT EXISTS vault_states (
  owner_email TEXT PRIMARY KEY,
  revision INTEGER NOT NULL DEFAULT 0,
  state_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`;

const PHOTO_SCHEMA = `CREATE TABLE IF NOT EXISTS vault_photos (
  id TEXT PRIMARY KEY,
  owner_email TEXT NOT NULL,
  card_id TEXT NOT NULL,
  copy_id TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL,
  filename TEXT NOT NULL,
  created_at TEXT NOT NULL
)`;

const PHOTO_OWNER_INDEX = 'CREATE INDEX IF NOT EXISTS vault_photos_owner_idx ON vault_photos (owner_email, copy_id)';
const MAX_STATE_BYTES = 5 * 1024 * 1024;
const MAX_PHOTO_BYTES = 12 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);
const SESSION_COOKIE = 'gibly_vault_session';
const SESSION_MAX_AGE = 365 * 24 * 60 * 60;
const NATIVE_ORIGINS = new Set(['capacitor://localhost', 'ionic://localhost']);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return corsResponse(request, new Response(null, { status: 204 }));

    let response;
    try {
      if (url.pathname === '/api/pair') {
        response = await handlePairing(request, env, url);
      } else if (url.pathname.startsWith('/api/photos/') && request.method === 'GET') {
        if (!env.DB || !env.PHOTOS) {
          response = json({ error: 'Photo storage is not configured yet.' }, 503);
        } else {
          await ensureSchema(env.DB);
          response = await readPhoto(env, url.pathname.slice('/api/photos/'.length));
        }
      } else {
        const ownerEmail = await authenticatedEmail(request, url, env);
        if (!ownerEmail) {
          response = json({ error: 'Pair this device to sync your private vault.' }, 401);
        } else if (!env.DB) {
          response = json({ error: 'Cloud sync is not configured yet.' }, 503);
        } else {
          await ensureSchema(env.DB);
          if (url.pathname === '/api/state') response = await handleState(request, env, ownerEmail);
          else if (url.pathname === '/api/photos' && request.method === 'POST') response = await uploadPhoto(request, env, ownerEmail, url);
          else if (url.pathname.startsWith('/api/photos/')) response = await handlePhoto(request, env, ownerEmail, url.pathname.slice('/api/photos/'.length));
          else response = json({ error: 'Not found.' }, 404);
        }
      }
    } catch (error) {
      response = json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
    }
    return corsResponse(request, response);
  }
};

async function authenticatedEmail(request, url, env) {
  const forwarded = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  const owner = String(env.VAULT_OWNER_EMAIL || '').trim().toLowerCase();
  if (forwarded && (!owner || forwarded === owner)) return forwarded;
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return 'local-preview@skylanders.app';
  if (await hasValidNativeSession(request, env)) return owner;
  if (await hasValidPairingCookie(request, env)) return owner;
  return '';
}

async function handlePairing(request, env, url) {
  if (!env.VAULT_PAIRING_CODE || !env.VAULT_OWNER_EMAIL) {
    return json({ error: 'Device pairing is not configured yet.' }, 503);
  }

  if (request.method === 'GET') {
    return json({ paired: Boolean(await authenticatedEmail(request, url, env)) });
  }

  if (request.method === 'DELETE') {
    return json({ paired: false }, 200, {
      'set-cookie': `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${url.protocol === 'https:' ? '; Secure' : ''}`
    });
  }

  if (request.method !== 'POST') return methodNotAllowed(['GET', 'POST', 'DELETE']);
  const bodyText = await request.text();
  if (bodyText.length > 2048) return json({ error: 'Pairing request is too large.' }, 413);
  let body;
  try { body = JSON.parse(bodyText); } catch { return json({ error: 'Enter the pairing code shown by the Vault owner.' }, 400); }
  if (!await secureCodeMatch(body?.code, env.VAULT_PAIRING_CODE)) {
    return json({ error: 'That pairing code is not correct.' }, 401);
  }

  const token = await pairingSessionToken(env.VAULT_PAIRING_CODE);
  const nativeClient = request.headers.get('x-vault-native') === 'ios';
  return json({ paired: true, ...(nativeClient ? { sessionToken: token } : {}) }, 200, {
    'set-cookie': `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE}${url.protocol === 'https:' ? '; Secure' : ''}`
  });
}

async function hasValidPairingCookie(request, env) {
  if (!env.VAULT_PAIRING_CODE || !env.VAULT_OWNER_EMAIL) return false;
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const supplied = cookies.get(SESSION_COOKIE) || '';
  if (!supplied) return false;
  const expected = await pairingSessionToken(env.VAULT_PAIRING_CODE);
  return timingSafeEqual(supplied, expected);
}

async function hasValidNativeSession(request, env) {
  if (!env.VAULT_PAIRING_CODE || !env.VAULT_OWNER_EMAIL) return false;
  const authorization = request.headers.get('authorization') || '';
  const supplied = authorization.match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1] || '';
  if (!supplied) return false;
  const expected = await pairingSessionToken(env.VAULT_PAIRING_CODE);
  return timingSafeEqual(supplied, expected);
}

async function secureCodeMatch(supplied, expected) {
  const suppliedHash = await sha256(normalizePairingCode(supplied));
  const expectedHash = await sha256(normalizePairingCode(expected));
  return timingSafeEqual(suppliedHash, expectedHash);
}

async function pairingSessionToken(secret) {
  return sha256(`gibly-vault-session-v1:${normalizePairingCode(secret)}`);
}

function normalizePairingCode(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function parseCookies(header) {
  const cookies = new Map();
  header.split(';').forEach((part) => {
    const separator = part.indexOf('=');
    if (separator < 1) return;
    cookies.set(part.slice(0, separator).trim(), part.slice(separator + 1).trim());
  });
  return cookies;
}

function timingSafeEqual(left, right) {
  const a = String(left || '');
  const b = String(right || '');
  let difference = a.length ^ b.length;
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    difference |= (a.charCodeAt(index % Math.max(1, a.length)) || 0) ^ (b.charCodeAt(index % Math.max(1, b.length)) || 0);
  }
  return difference === 0;
}

async function ensureSchema(db) {
  await db.batch([
    db.prepare(STATE_SCHEMA),
    db.prepare(PHOTO_SCHEMA),
    db.prepare(PHOTO_OWNER_INDEX)
  ]);
}

async function handleState(request, env, ownerEmail) {
  const db = env.DB;
  if (request.method === 'GET') {
    const row = await db.prepare('SELECT revision, state_json, updated_at FROM vault_states WHERE owner_email = ?')
      .bind(ownerEmail).first();
    return json(row ? {
      revision: row.revision,
      state: JSON.parse(row.state_json),
      updatedAt: row.updated_at
    } : { revision: 0, state: null, updatedAt: null });
  }

  if (request.method === 'DELETE') {
    const photoRows = await db.prepare('SELECT object_key FROM vault_photos WHERE owner_email = ?').bind(ownerEmail).all();
    const objectKeys = (photoRows.results || []).map((row) => row.object_key).filter(Boolean);
    await db.batch([
      db.prepare('DELETE FROM vault_photos WHERE owner_email = ?').bind(ownerEmail),
      db.prepare('DELETE FROM vault_states WHERE owner_email = ?').bind(ownerEmail)
    ]);
    if (env.PHOTOS) {
      for (let index = 0; index < objectKeys.length; index += 500) {
        await env.PHOTOS.delete(objectKeys.slice(index, index + 500));
      }
    }
    return json({ deleted: true, photosDeleted: objectKeys.length });
  }

  if (request.method !== 'PUT') return methodNotAllowed(['GET', 'PUT', 'DELETE']);
  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > MAX_STATE_BYTES) return json({ error: 'Vault state is too large.' }, 413);

  let body;
  try { body = JSON.parse(bodyText); } catch { return json({ error: 'Invalid JSON.' }, 400); }
  if (!body?.state || typeof body.state !== 'object' || Array.isArray(body.state)) return json({ error: 'A valid vault state is required.' }, 400);
  const baseRevision = Math.max(0, Number(body.baseRevision) || 0);
  const current = await db.prepare('SELECT revision, state_json, updated_at FROM vault_states WHERE owner_email = ?')
    .bind(ownerEmail).first();
  const currentRevision = Number(current?.revision || 0);
  if (baseRevision !== currentRevision) {
    return json({
      error: 'revision_conflict',
      revision: currentRevision,
      state: current ? JSON.parse(current.state_json) : null,
      updatedAt: current?.updated_at || null
    }, 409);
  }

  const nextRevision = currentRevision + 1;
  const updatedAt = new Date().toISOString();
  const stateJson = JSON.stringify(body.state);
  const write = current
    ? await db.prepare(`UPDATE vault_states SET revision = ?, state_json = ?, updated_at = ?
        WHERE owner_email = ? AND revision = ?`)
      .bind(nextRevision, stateJson, updatedAt, ownerEmail, currentRevision).run()
    : await db.prepare(`INSERT OR IGNORE INTO vault_states (owner_email, revision, state_json, updated_at)
        VALUES (?, ?, ?, ?)`).bind(ownerEmail, nextRevision, stateJson, updatedAt).run();
  if (Number(write?.meta?.changes || 0) !== 1) {
    const latest = await db.prepare('SELECT revision, state_json, updated_at FROM vault_states WHERE owner_email = ?')
      .bind(ownerEmail).first();
    return json({
      error: 'revision_conflict',
      revision: Number(latest?.revision || 0),
      state: latest ? JSON.parse(latest.state_json) : null,
      updatedAt: latest?.updated_at || null
    }, 409);
  }
  return json({ revision: nextRevision, updatedAt });
}

async function uploadPhoto(request, env, ownerEmail, url) {
  if (!env.PHOTOS) return json({ error: 'Photo storage is not configured yet.' }, 503);
  const cardId = cleanId(url.searchParams.get('cardId'));
  const copyId = cleanId(url.searchParams.get('copyId'));
  if (!cardId || !copyId) return json({ error: 'A valid card and copy are required.' }, 400);
  const contentType = (request.headers.get('content-type') || '').split(';')[0].toLowerCase();
  if (!IMAGE_TYPES.has(contentType)) return json({ error: 'Use a JPEG, PNG, WebP, HEIC, or HEIF image.' }, 415);
  const declaredSize = Number(request.headers.get('content-length') || 0);
  if (declaredSize > MAX_PHOTO_BYTES) return json({ error: 'Photos must be 12 MB or smaller.' }, 413);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength || bytes.byteLength > MAX_PHOTO_BYTES) return json({ error: 'Photos must be between 1 byte and 12 MB.' }, 413);

  const id = crypto.randomUUID();
  const ownerKey = await sha256(ownerEmail);
  const extension = extensionFor(contentType);
  const objectKey = `${ownerKey}/${copyId}/${id}.${extension}`;
  const filename = cleanFilename(request.headers.get('x-photo-filename')) || `collection-photo.${extension}`;
  const createdAt = new Date().toISOString();
  await env.PHOTOS.put(objectKey, bytes, { httpMetadata: { contentType } });
  try {
    await env.DB.prepare(`INSERT INTO vault_photos
      (id, owner_email, card_id, copy_id, object_key, content_type, filename, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, ownerEmail, cardId, copyId, objectKey, contentType, filename, createdAt).run();
  } catch (error) {
    await env.PHOTOS.delete(objectKey);
    throw error;
  }
  return json({ photo: { id, url: `/api/photos/${id}`, contentType, filename, createdAt } }, 201);
}

async function handlePhoto(request, env, ownerEmail, photoId) {
  if (!env.PHOTOS) return json({ error: 'Photo storage is not configured yet.' }, 503);
  const id = cleanId(photoId);
  if (!id) return json({ error: 'Invalid photo.' }, 400);
  const row = await env.DB.prepare('SELECT id, object_key FROM vault_photos WHERE id = ? AND owner_email = ?')
    .bind(id, ownerEmail).first();
  if (!row) return request.method === 'DELETE'
    ? json({ deleted: true, missing: true })
    : json({ error: 'Photo not found.' }, 404);

  if (request.method === 'DELETE') {
    await env.DB.prepare('DELETE FROM vault_photos WHERE id = ? AND owner_email = ?').bind(id, ownerEmail).run();
    await env.PHOTOS.delete(row.object_key);
    return json({ deleted: true });
  }
  return methodNotAllowed(['DELETE']);
}

async function readPhoto(env, photoId) {
  const id = cleanId(photoId);
  if (!id) return json({ error: 'Invalid photo.' }, 400);
  const row = await env.DB.prepare(`SELECT object_key, content_type, filename
    FROM vault_photos WHERE id = ?`).bind(id).first();
  if (!row) return json({ error: 'Photo not found.' }, 404);
  const object = await env.PHOTOS.get(row.object_key);
  if (!object) return json({ error: 'Photo file not found.' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('content-type', row.content_type);
  headers.set('cache-control', 'private, max-age=300');
  headers.set('content-disposition', `inline; filename="${row.filename.replace(/["\\]/g, '')}"`);
  headers.set('x-content-type-options', 'nosniff');
  return new Response(object.body, { headers });
}

function cleanId(value) {
  const text = String(value || '');
  return /^[a-zA-Z0-9._:-]{1,140}$/.test(text) ? text : '';
}

function cleanFilename(value) {
  let filename = String(value || '');
  try { filename = decodeURIComponent(filename); } catch {}
  return filename.replace(/[\\/\u0000-\u001f]/g, '').slice(0, 120);
}

function extensionFor(contentType) {
  return { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif' }[contentType] || 'bin';
}

async function sha256(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function methodNotAllowed(methods) {
  return new Response(JSON.stringify({ error: 'Method not allowed.' }), {
    status: 405,
    headers: { 'content-type': 'application/json; charset=utf-8', allow: methods.join(', '), 'cache-control': 'no-store' }
  });
}

function json(value, status = 200, extraHeaders = {}) {
  const headers = new Headers({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  Object.entries(extraHeaders).forEach(([key, value]) => headers.set(key, value));
  return new Response(JSON.stringify(value), {
    status,
    headers
  });
}

function corsResponse(request, response) {
  const origin = request.headers.get('origin') || '';
  if (!NATIVE_ORIGINS.has(origin)) return response;
  const headers = new Headers(response.headers);
  headers.set('access-control-allow-origin', origin);
  headers.set('access-control-allow-credentials', 'true');
  headers.set('access-control-allow-methods', 'GET, PUT, POST, DELETE, OPTIONS');
  headers.set('access-control-allow-headers', 'authorization, content-type, x-photo-filename, x-vault-native');
  headers.set('access-control-max-age', '86400');
  headers.append('vary', 'Origin');
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}
