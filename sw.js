const CORE_CACHE_NAME = 'gibly-core-stable-v21';
const LIBRARY_CACHE_NAME = 'gibly-offline-library-v4';
const LIBRARY_REVISION = 'complete-card-library-2026-07-25-v4';
const LIBRARY_STATUS_URL = './offline-library-status.json';
const UNRELEASED_CARD_IDS = new Set([
  'catalog-11513604',
  'catalog-11513621',
  'catalog-11513645',
  'catalog-11513653',
  'catalog-11513673',
  'catalog-58496'
]);
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './public/manifest-ipad.webmanifest',
  './src/app.js?v=stable-v21',
  './src/components/helpers.js?v=animation-2',
  './src/components/icons.js?v=animation-2',
  './src/components/ProgressSummary.js?v=animation-2',
  './src/components/VillainBoard.js?v=animation-2',
  './src/components/TrapRack.js?v=animation-2',
  './src/components/TrapEditor.js?v=animation-2',
  './src/components/MasterCatalog.js?v=stable-v21',
  './src/components/FeatureSuite.js?v=stable-v21',
  './src/components/CloudSync.js?v=stable-v21',
  './src/styles/gallery.css?v=stable-v21',
  './src/styles/card-v2.css?v=stable-v21',
  './src/styles/card-v3.css?v=stable-v21',
  './src/styles/feature-suite.css?v=stable-v21',
  './src/styles/theme-warm-v4.css?v=stable-v21',
  './src/styles/final-complete-v9.css?v=stable-v21',
  './src/styles/professional-v20.css?v=stable-v21',
  './assets/fonts/vault-manrope-latin.woff2',
  './assets/fonts/vault-space-grotesk-latin.woff2',
  './src/data/elements.json',
  './src/data/villains.json',
  './src/data/traps.json',
  './src/data/catalog.json',
  './src/data/catalog-details.json',
  './public/app-icon-512.png',
  './public/app-icon-192.png',
  './public/apple-touch-icon.png',
  './public/vault-social-v2.png',
  './public/app-icon.svg'
];
let libraryDownload = null;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CORE_CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys
      .filter((key) => key !== CORE_CACHE_NAME && key !== LIBRARY_CACHE_NAME)
      .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.type === 'OFFLINE_LIBRARY_STATUS') {
    event.waitUntil(reportLibraryStatus());
  }
  if (message.type === 'DOWNLOAD_OFFLINE_LIBRARY') {
    if (!libraryDownload) {
      libraryDownload = downloadLibrary().finally(() => { libraryDownload = null; });
    }
    event.waitUntil(libraryDownload);
  }
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (requestUrl.pathname.includes('/assets/card-art/cards/') || requestUrl.pathname.includes('/assets/card-art/thumbs/')) {
    event.respondWith(cardArtworkResponse(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(cacheFirst(event.request, './index.html'));
    return;
  }

  if (['.json', '.js', '.css', '.webmanifest'].some((extension) => requestUrl.pathname.endsWith(extension))) {
    event.respondWith(cacheFirst(event.request));
    return;
  }

  event.respondWith(cacheFirst(event.request));
});

async function downloadLibrary() {
  try {
    const response = await fetch('./src/data/catalog.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('Catalog download failed.');
    const catalog = await response.json();
    const cards = (catalog.cards || []).filter((card) => {
      return !UNRELEASED_CARD_IDS.has(card.id)
        && !['Pack / Set', 'Prototype / Unreleased', 'Villain Reference'].includes(card.category);
    });
    const urls = [];
    cards.forEach((card) => {
      const id = encodeURIComponent(card.id);
      urls.push(`./assets/card-art/thumbs/${id}.webp`);
      urls.push(`./assets/card-art/cards/${id}.webp`);
    });

    const cache = await caches.open(LIBRARY_CACHE_NAME);
    const priorStatusResponse = await cache.match(LIBRARY_STATUS_URL);
    const priorStatus = priorStatusResponse ? await priorStatusResponse.json().catch(() => null) : null;
    const refreshAssets = Boolean(priorStatus && priorStatus.revision !== LIBRARY_REVISION);
    let completed = 0;
    let lastPercent = -1;
    for (let index = 0; index < urls.length; index += 8) {
      const batch = urls.slice(index, index + 8);
      await Promise.all(batch.map(async (url) => {
        const request = new Request(url);
        const cached = await cache.match(request);
        if (refreshAssets || !cached) {
          const asset = await fetch(request);
          if (!asset.ok) throw new Error(`Card artwork download failed: ${url}`);
          await cache.put(request, asset);
        }
        completed += 1;
        const percent = Math.floor((completed / urls.length) * 100);
        if (percent !== lastPercent && (percent % 2 === 0 || percent === 100)) {
          lastPercent = percent;
          await notifyClients({ type: 'OFFLINE_LIBRARY_PROGRESS', percent, completed, total: urls.length });
        }
      }));
    }

    await cache.put(LIBRARY_STATUS_URL, new Response(JSON.stringify({
      revision: LIBRARY_REVISION,
      cards: cards.length,
      assets: urls.length,
      completedAt: new Date().toISOString()
    }), { headers: { 'content-type': 'application/json' } }));
    await notifyClients({ type: 'OFFLINE_LIBRARY_COMPLETE', cards: cards.length, assets: urls.length });
  } catch (error) {
    await notifyClients({ type: 'OFFLINE_LIBRARY_ERROR', error: String((error && error.message) || error) });
    throw error;
  }
}

async function reportLibraryStatus() {
  const cache = await caches.open(LIBRARY_CACHE_NAME);
  const response = await cache.match(LIBRARY_STATUS_URL);
  let metadata = null;
  if (response) metadata = await response.json().catch(() => null);
  await notifyClients({
    type: 'OFFLINE_LIBRARY_STATUS',
    complete: Boolean(metadata && metadata.revision === LIBRARY_REVISION),
    cards: Number((metadata && metadata.cards) || 0),
    completedAt: (metadata && metadata.completedAt) || ''
  });
}

async function notifyClients(message) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windows.forEach((client) => client.postMessage(message));
}

async function cardArtworkResponse(request) {
  const cache = await caches.open(LIBRARY_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}

async function cacheFirst(request, fallback) {
  const cache = await caches.open(CORE_CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  if (fallback) {
    const fallbackResponse = await cache.match(fallback);
    if (fallbackResponse) return fallbackResponse;
  }
  try {
    const response = await fetch(request);
    if (response.ok) await cache.put(request, response.clone());
    return response;
  } catch {
    return Response.error();
  }
}
