const CACHE_NAME = 'hubleads-v11';
const ASSETS = [
  '/',
  '/index.html',
  '/version.json',
  '/css/design-tokens.css',
  '/css/globals.css',
  '/js/util.js',
  '/js/db.js',
  '/js/api.js',
  '/js/camera.js',
  '/js/form.js',
  '/js/map.js',
  '/js/sugeridos.js',
  '/js/version.js',
  '/js/app.js',
  '/manifest.json',
  'https://unpkg.com/dexie@3.2.4/dist/dexie.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
  'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      const results = await Promise.allSettled(ASSETS.map(url => fetch(url).then(r => {
        if (!r.ok) throw new Error(url);
        return cache.put(url, r);
      })));
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length) console.warn('[SW] alguns assets falharam:', failed.length);
    }).catch(() => {})
  );
  self.skipWaiting();
});

const MAX_TILES = 200;
async function trimTilesCache() {
  const cache = await caches.open(CACHE_NAME + '-tiles');
  const keys = await cache.keys();
  if (keys.length > MAX_TILES) {
    await cache.delete(keys[0]);
    return trimTilesCache();
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME && !key.endsWith('-tiles')).map((key) => caches.delete(key))
      );
    }).then(() => trimTilesCache())
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  // PocketBase API: SEMPRE busca na rede
  if (event.request.url.includes('/api/')) {
    event.respondWith(fetch(event.request).catch(() => new Response('{}', { status: 503, headers: { 'Content-Type': 'application/json' } })));
    return;
  }

  // OpenStreetMap Tiles: Cache First com fallback de rede + LRU trim
  if (event.request.url.includes('tile.openstreetmap.org')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        return cached || fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME + '-tiles').then((cache) => {
              cache.put(event.request, clone).then(() => trimTilesCache());
            });
          }
          return response;
        }).catch(() => cached);
      })
    );
    return;
  }

  // Assets do próprio app (js/css/html): NETWORK-FIRST.
  // Garante que o celular sempre receba a versão nova após o deploy;
  // o cache só é usado quando o servidor não responde (offline).
  if (event.request.url.startsWith(self.location.origin)) {
    event.respondWith(
      fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/index.html')))
    );
    return;
  }

  // CDNs (Dexie/Leaflet — versões fixas): Cache First
  event.respondWith(
    caches.match(event.request).then((cached) => {
      return cached || fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
