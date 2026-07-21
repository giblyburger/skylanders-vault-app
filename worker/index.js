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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);

    try {
      const ownerEmail = authenticatedEmail(request, url);
      if (!ownerEmail) return json({ error: 'Sign in with ChatGPT to sync your vault.' }, 401);
      if (!env.DB) return json({ error: 'Cloud sync is not configured yet.' }, 503);

      await ensureSchema(env.DB);
      if (url.pathname === '/api/state') return handleState(request, env, ownerEmail);
      if (url.pathname === '/api/photos' && request.method === 'POST') return uploadPhoto(request, env, ownerEmail, url);
      if (url.pathname.startsWith('/api/photos/')) return handlePhoto(request, env, ownerEmail, url.pathname.slice('/api/photos/'.length));
      return json({ error: 'Not found.' }, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : 'Unexpected server error.' }, 500);
    }
  }
};

function authenticatedEmail(request, url) {
  const forwarded = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase();
  if (forwarded) return forwarded;
  if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') return 'local-preview@skylanders.app';
  return '';
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
    if (env.PHOTOS) {
      for (let index = 0; index < objectKeys.length; index += 500) {
        await env.PHOTOS.delete(objectKeys.slice(index, index + 500));
      }
    }
    await db.batch([
      db.prepare('DELETE FROM vault_photos WHERE owner_email = ?').bind(ownerEmail),
      db.prepare('DELETE FROM vault_states WHERE owner_email = ?').bind(ownerEmail)
    ]);
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
  const row = await env.DB.prepare(`SELECT id, object_key, content_type, filename, created_at
    FROM vault_photos WHERE id = ? AND owner_email = ?`).bind(id, ownerEmail).first();
  if (!row) return json({ error: 'Photo not found.' }, 404);

  if (request.method === 'GET') {
    const object = await env.PHOTOS.get(row.object_key);
    if (!object) return json({ error: 'Photo file not found.' }, 404);
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('content-type', row.content_type);
    headers.set('cache-control', 'private, max-age=300');
    headers.set('content-disposition', `inline; filename="${row.filename.replace(/["\\]/g, '')}"`);
    return new Response(object.body, { headers });
  }

  if (request.method === 'DELETE') {
    await env.PHOTOS.delete(row.object_key);
    await env.DB.prepare('DELETE FROM vault_photos WHERE id = ? AND owner_email = ?').bind(id, ownerEmail).run();
    return json({ deleted: true });
  }
  return methodNotAllowed(['GET', 'DELETE']);
}

function cleanId(value) {
  const text = String(value || '');
  return /^[a-zA-Z0-9._:-]{1,140}$/.test(text) ? text : '';
}

function cleanFilename(value) {
  return String(value || '').replace(/[\\/\u0000-\u001f]/g, '').slice(0, 120);
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

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}
