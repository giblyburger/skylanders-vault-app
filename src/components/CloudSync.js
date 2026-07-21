const DEVICE_KEY = 'gibly-skylanders-device-id';
const ACTIVE_POLL_MS = 1800;
const BACKGROUND_POLL_MS = 10000;

export function createCloudSync({ getState, normalizeState, applyState, onStatus }) {
  let revision = 0;
  let baseState = clone(getState());
  let dirty = false;
  let saving = false;
  let started = false;
  let saveTimer = null;
  let pollTimer = null;
  const clientId = getDeviceId();

  async function request(path, options = {}) {
    const response = await fetch(path, {
      credentials: 'same-origin',
      cache: 'no-store',
      ...options,
      headers: { ...(options.headers || {}) }
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(payload.error || 'Cloud request failed.');
      error.status = response.status;
      error.payload = payload;
      throw error;
    }
    return payload;
  }

  async function start() {
    if (started) return;
    started = true;
    onStatus({ state: 'connecting', text: 'Connecting' });
    try {
      const remote = await request('/api/state');
      revision = Number(remote.revision || 0);
      if (remote.state) {
        const normalizedRemote = normalizeState(remote.state);
        const local = normalizeState(getState());
        const localHasData = hasCollectionData(local);
        const merged = localHasData && !same(local, normalizedRemote)
          ? mergeStates(baseState, local, normalizedRemote)
          : normalizedRemote;
        baseState = clone(normalizedRemote);
        applyState(merged);
        dirty = !same(merged, normalizedRemote);
        if (dirty) await save();
      } else {
        dirty = true;
        await save();
      }
      onStatus({ state: 'synced', text: 'Synced' });
    } catch (error) {
      onStatus({ state: navigator.onLine ? 'error' : 'offline', text: navigator.onLine ? 'Sync unavailable' : 'Offline' });
    } finally {
      schedulePoll();
    }
  }

  function queue() {
    dirty = true;
    onStatus({ state: navigator.onLine ? 'syncing' : 'offline', text: navigator.onLine ? 'Syncing' : 'Saved offline' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 260);
  }

  async function save() {
    if (!dirty || saving) return;
    saving = true;
    dirty = false;
    const local = normalizeState(getState());
    onStatus({ state: 'syncing', text: 'Syncing' });
    try {
      const result = await request('/api/state', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ state: local, baseRevision: revision, clientId })
      });
      revision = Number(result.revision || revision + 1);
      baseState = clone(local);
      onStatus({ state: 'synced', text: 'Synced' });
    } catch (error) {
      if (error.status === 409) {
        const remote = normalizeState(error.payload?.state || {});
        const merged = mergeStates(baseState, local, remote);
        revision = Number(error.payload?.revision || 0);
        baseState = clone(remote);
        applyState(merged);
        dirty = true;
      } else {
        dirty = true;
        onStatus({ state: navigator.onLine ? 'error' : 'offline', text: navigator.onLine ? 'Retrying sync' : 'Saved offline' });
      }
    } finally {
      saving = false;
      if (dirty) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(save, 900);
      }
    }
  }

  async function poll() {
    try {
      const remote = await request('/api/state');
      const remoteRevision = Number(remote.revision || 0);
      if (remote.state && remoteRevision > revision) {
        const normalizedRemote = normalizeState(remote.state);
        if (dirty || saving) {
          const merged = mergeStates(baseState, normalizeState(getState()), normalizedRemote);
          revision = remoteRevision;
          baseState = clone(normalizedRemote);
          applyState(merged);
          dirty = true;
          if (!saving) save();
        } else {
          revision = remoteRevision;
          baseState = clone(normalizedRemote);
          applyState(normalizedRemote);
          onStatus({ state: 'synced', text: 'Updated' });
          setTimeout(() => onStatus({ state: 'synced', text: 'Synced' }), 1200);
        }
      } else if (!dirty && !saving) {
        onStatus({ state: 'synced', text: 'Synced' });
      }
    } catch {
      onStatus({ state: navigator.onLine ? 'error' : 'offline', text: navigator.onLine ? 'Retrying sync' : 'Offline' });
    } finally {
      schedulePoll();
    }
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(poll, document.hidden ? BACKGROUND_POLL_MS : ACTIVE_POLL_MS);
  }

  async function uploadPhoto(cardId, copyId, file) {
    if (!file || file.size > 12 * 1024 * 1024) throw new Error('Choose a photo smaller than 12 MB.');
    const params = new URLSearchParams({ cardId, copyId });
    const result = await request(`/api/photos?${params}`, {
      method: 'POST',
      headers: {
        'content-type': file.type || 'application/octet-stream',
        'x-photo-filename': encodeURIComponent(file.name || 'collection-photo')
      },
      body: file
    });
    return result.photo;
  }

  async function deletePhoto(photoId) {
    await request(`/api/photos/${encodeURIComponent(photoId)}`, { method: 'DELETE' });
  }

  async function reset() {
    clearTimeout(saveTimer);
    dirty = false;
    saving = true;
    onStatus({ state: 'syncing', text: 'Clearing vault' });
    try {
      await request('/api/state', { method: 'DELETE' });
      revision = 0;
      baseState = clone(normalizeState(getState()));
      dirty = true;
    } finally {
      saving = false;
    }
    await save();
  }

  document.addEventListener('visibilitychange', schedulePoll);
  window.addEventListener('online', () => { onStatus({ state: 'connecting', text: 'Reconnecting' }); save(); poll(); });
  window.addEventListener('offline', () => onStatus({ state: 'offline', text: 'Saved offline' }));

  return { start, queue, save, reset, uploadPhoto, deletePhoto, getRevision: () => revision };
}

function mergeStates(base, local, remote) {
  const merged = { version: Math.max(Number(local?.version || 0), Number(remote?.version || 0), 6) };
  ['villains', 'traps', 'catalog'].forEach((section) => {
    const baseMap = base?.[section] || {};
    const localMap = local?.[section] || {};
    const remoteMap = remote?.[section] || {};
    merged[section] = {};
    const keys = new Set([...Object.keys(baseMap), ...Object.keys(localMap), ...Object.keys(remoteMap)]);
    keys.forEach((key) => {
      const localChanged = !same(localMap[key], baseMap[key]);
      const value = localChanged ? localMap[key] : remoteMap[key];
      if (value !== undefined) merged[section][key] = clone(value);
    });
  });
  return merged;
}

function hasCollectionData(state) {
  return ['villains', 'traps', 'catalog'].some((section) => Object.keys(state?.[section] || {}).length > 0);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getDeviceId() {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}
