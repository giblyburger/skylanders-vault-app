const DEVICE_KEY = 'gibly-skylanders-device-id';
const LEGACY_IPAD = document.documentElement.classList.contains('legacy-ipad');
const ACTIVE_POLL_MS = LEGACY_IPAD ? 6000 : 1800;
const BACKGROUND_POLL_MS = LEGACY_IPAD ? 30000 : 10000;

export function createCloudSync({ getState, normalizeState, applyState, onStatus, onPairingRequired }) {
  let revision = 0;
  let baseState = clone(getState());
  let dirty = false;
  let saving = false;
  let started = false;
  let locked = false;
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
      if (response.status === 401 && path !== '/api/pair') {
        locked = true;
        onPairingRequired?.();
      }
      throw error;
    }
    return payload;
  }

  async function start() {
    if (started) return;
    started = true;
    locked = false;
    onStatus({ state: 'connecting', text: 'Connecting' });
    try {
      const remote = await request('/api/state');
      revision = Number(remote.revision || 0);
      if (remote.state) {
        const normalizedRemote = normalizeState(remote.state);
        const local = normalizeState(getState());
        const localHasData = hasCollectionData(local);
        const merged = localHasData && !same(local, normalizedRemote)
          ? mergeStates(emptyState(), local, normalizedRemote)
          : normalizedRemote;
        baseState = clone(normalizedRemote);
        if (!same(local, merged)) applyState(merged);
        dirty = !same(merged, normalizedRemote);
        if (dirty) await save();
      } else {
        dirty = true;
        await save();
      }
      onStatus({ state: 'synced', text: 'Synced' });
    } catch (error) {
      if (error.status === 401) {
        locked = true;
        onStatus({ state: 'locked', text: 'Pair device' });
      } else {
        onStatus({ state: navigator.onLine ? 'error' : 'offline', text: navigator.onLine ? 'Sync unavailable' : 'Offline' });
      }
    } finally {
      if (!locked) schedulePoll();
    }
  }

  function queue() {
    dirty = true;
    if (locked) {
      onStatus({ state: 'locked', text: 'Pair device' });
      return;
    }
    if (!navigator.onLine) {
      onStatus({ state: 'offline', text: 'Saved offline' });
      return;
    }
    onStatus({ state: 'syncing', text: 'Syncing' });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 260);
  }

  async function save() {
    if (!dirty || saving || locked) return;
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
      } else if (error.status === 401) {
        locked = true;
        dirty = true;
        onStatus({ state: 'locked', text: 'Pair device' });
      } else {
        dirty = true;
        onStatus({ state: navigator.onLine ? 'error' : 'offline', text: navigator.onLine ? 'Retrying sync' : 'Saved offline' });
      }
    } finally {
      saving = false;
      if (dirty && !locked && navigator.onLine) {
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
    } catch (error) {
      if (error.status === 401) {
        locked = true;
        onStatus({ state: 'locked', text: 'Pair device' });
      } else {
        onStatus({ state: navigator.onLine ? 'error' : 'offline', text: navigator.onLine ? 'Retrying sync' : 'Offline' });
      }
    } finally {
      if (!locked) schedulePoll();
    }
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (locked || !navigator.onLine) return;
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

  async function pair(code) {
    clearTimeout(pollTimer);
    clearTimeout(saveTimer);
    onStatus({ state: 'connecting', text: 'Pairing' });
    try {
      await request('/api/pair', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code })
      });
    } catch (error) {
      locked = true;
      onStatus({ state: 'locked', text: 'Pair device' });
      throw error;
    }
    revision = 0;
    locked = false;
    started = false;
    await start();
    return true;
  }

  document.addEventListener('visibilitychange', schedulePoll);
  window.addEventListener('online', () => {
    if (locked) {
      onStatus({ state: 'locked', text: 'Pair device' });
      onPairingRequired?.();
      return;
    }
    onStatus({ state: 'connecting', text: 'Reconnecting' });
    save();
    poll();
  });
  window.addEventListener('offline', () => {
    clearTimeout(saveTimer);
    clearTimeout(pollTimer);
    onStatus({ state: 'offline', text: 'Saved offline' });
  });

  return { start, pair, queue, save, reset, uploadPhoto, deletePhoto, getRevision: () => revision };
}

export function mergeStates(base, local, remote) {
  const merged = {
    version: Math.max(Number(local?.version || 0), Number(remote?.version || 0), 7),
    villains: mergeObjectMap(base?.villains, local?.villains, remote?.villains),
    traps: mergeObjectMap(base?.traps, local?.traps, remote?.traps),
    catalog: mergeCatalogMap(base?.catalog, local?.catalog, remote?.catalog),
    assemblies: mergeRecordArray(base?.assemblies, local?.assemblies, remote?.assemblies),
    timeline: mergeTimeline(local?.timeline, remote?.timeline)
  };
  return merged;
}

function emptyState() {
  return { version: 7, villains: {}, traps: {}, catalog: {}, assemblies: [], timeline: [] };
}

function mergeObjectMap(base = {}, local = {}, remote = {}) {
  const result = {};
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})]);
  keys.forEach((key) => {
    const value = chooseThreeWay(base?.[key], local?.[key], remote?.[key]);
    if (value !== undefined) result[key] = clone(value);
  });
  return result;
}

function mergeCatalogMap(base = {}, local = {}, remote = {}) {
  const result = {};
  const keys = new Set([...Object.keys(base || {}), ...Object.keys(local || {}), ...Object.keys(remote || {})]);
  keys.forEach((key) => {
    const baseRecord = base?.[key];
    const localRecord = local?.[key];
    const remoteRecord = remote?.[key];
    const localChanged = !same(localRecord, baseRecord);
    const remoteChanged = !same(remoteRecord, baseRecord);
    if (!localChanged || !remoteChanged || !localRecord || !remoteRecord) {
      const value = localChanged ? localRecord : remoteRecord;
      if (value !== undefined) result[key] = clone(value);
      return;
    }
    result[key] = {
      ...clone(remoteRecord),
      ...clone(localRecord),
      wishlist: Boolean(chooseThreeWay(baseRecord?.wishlist, localRecord.wishlist, remoteRecord.wishlist)),
      notes: String(chooseThreeWay(baseRecord?.notes, localRecord.notes, remoteRecord.notes) || ''),
      copies: mergeCopyArray(baseRecord?.copies, localRecord.copies, remoteRecord.copies)
    };
  });
  return result;
}

function mergeCopyArray(base = [], local = [], remote = []) {
  const baseMap = new Map((Array.isArray(base) ? base : []).filter((copy) => copy?.id).map((copy) => [copy.id, copy]));
  const localList = (Array.isArray(local) ? local : []).filter((copy) => copy?.id);
  const remoteList = (Array.isArray(remote) ? remote : []).filter((copy) => copy?.id);
  const localMap = new Map(localList.map((copy) => [copy.id, copy]));
  const remoteMap = new Map(remoteList.map((copy) => [copy.id, copy]));
  const order = [...new Set([...localList.map((copy) => copy.id), ...remoteList.map((copy) => copy.id), ...baseMap.keys()])];
  return order.map((id) => {
    const baseCopy = baseMap.get(id);
    const localCopy = localMap.get(id);
    const remoteCopy = remoteMap.get(id);
    const localChanged = !same(localCopy, baseCopy);
    const remoteChanged = !same(remoteCopy, baseCopy);
    if (!localChanged || !remoteChanged || !localCopy || !remoteCopy) {
      return clone(localChanged ? localCopy : remoteCopy);
    }
    const mergedCopy = { ...clone(remoteCopy), ...clone(localCopy), id };
    ['uid', 'condition', 'packaging', 'storage', 'acquired', 'paid', 'notes'].forEach((field) => {
      mergedCopy[field] = chooseThreeWay(baseCopy?.[field], localCopy[field], remoteCopy[field]);
    });
    mergedCopy.photos = mergeRecordArray(baseCopy?.photos, localCopy.photos, remoteCopy.photos);
    return mergedCopy;
  }).filter((copy) => copy !== undefined);
}

function mergeRecordArray(base = [], local = [], remote = []) {
  const baseMap = new Map((Array.isArray(base) ? base : []).filter((item) => item?.id).map((item) => [item.id, item]));
  const localList = (Array.isArray(local) ? local : []).filter((item) => item?.id);
  const remoteList = (Array.isArray(remote) ? remote : []).filter((item) => item?.id);
  const localMap = new Map(localList.map((item) => [item.id, item]));
  const remoteMap = new Map(remoteList.map((item) => [item.id, item]));
  const order = [...new Set([...localList.map((item) => item.id), ...remoteList.map((item) => item.id), ...baseMap.keys()])];
  return order.map((id) => chooseThreeWay(baseMap.get(id), localMap.get(id), remoteMap.get(id)))
    .filter((item) => item !== undefined)
    .map(clone);
}

function mergeTimeline(local = [], remote = []) {
  const events = new Map();
  [...(Array.isArray(remote) ? remote : []), ...(Array.isArray(local) ? local : [])]
    .filter((event) => event?.id)
    .forEach((event) => events.set(event.id, clone(event)));
  return [...events.values()]
    .sort((left, right) => String(left.at || '').localeCompare(String(right.at || '')))
    .slice(-300);
}

function chooseThreeWay(base, local, remote) {
  return !same(local, base) ? local : remote;
}

function hasCollectionData(state) {
  return ['villains', 'traps', 'catalog'].some((section) => Object.keys(state?.[section] || {}).length > 0)
    || (Array.isArray(state?.assemblies) && state.assemblies.length > 0)
    || (Array.isArray(state?.timeline) && state.timeline.length > 0);
}

function same(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

function getDeviceId() {
  let id = '';
  try { id = localStorage.getItem(DEVICE_KEY) || ''; } catch {}
  if (!id) id = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  try { localStorage.setItem(DEVICE_KEY, id); } catch {}
  return id;
}
