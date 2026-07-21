const CACHE_NAME = 'gibly-ipad-display-v1';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './public/manifest-ipad.webmanifest',
  './src/app.js?v=ipad-display-v1',
  './src/components/helpers.js?v=animation-2',
  './src/components/icons.js?v=animation-2',
  './src/components/ProgressSummary.js?v=animation-2',
  './src/components/VillainBoard.js?v=animation-2',
  './src/components/TrapRack.js?v=animation-2',
  './src/components/TrapEditor.js?v=animation-2',
  './src/components/MasterCatalog.js?v=ipad-display-v1',
  './src/components/CloudSync.js?v=cloud-nfc-v1',
  './src/styles/gallery.css?v=ipad-display-v1',
  './src/data/elements.json',
  './src/data/villains.json',
  './src/data/traps.json',
  './src/data/master-catalog.json',
  './public/board-reference.jpg',
  './public/app-icon-512.png',
  './public/apple-touch-icon.png',
  './public/social-preview.jpg',
  './public/app-icon.svg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const requestUrl = new URL(event.request.url);

  if (requestUrl.pathname.startsWith('/api/')) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put('./index.html', copy));
        }
        return response;
      }).catch(() => caches.match('./index.html'))
    );
    return;
  }

  if (['.json', '.js', '.css'].some((extension) => requestUrl.pathname.endsWith(extension))) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        }
        return response;
      }).catch(() => caches.match(event.request))
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      }
      return response;
    }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error()))
  );
});
