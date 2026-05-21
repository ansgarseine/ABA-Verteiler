// sw.js – Erweiterter Service Worker für Verteiler-Bestandsaufnahme

const STATIC_CACHE = 'aba-static-v1';
const IMAGE_CACHE  = 'aba-images-v1';
const API_CACHE    = 'aba-api-v1';

const STATIC_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Hilfsfunktion: Cache-Größe begrenzen
async function limitCacheSize(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    return limitCacheSize(cacheName, maxItems);
  }
}

// INSTALL – statische Assets precachen
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

// ACTIVATE – alte Caches löschen
self.addEventListener('activate', event => {
  const allowedCaches = [STATIC_CACHE, IMAGE_CACHE, API_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => !allowedCaches.includes(key))
          .map(key => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

// FETCH – unterschiedliche Strategien je nach Request-Typ
self.addEventListener('fetch', event => {
  const req = event.request;
  const url = new URL(req.url);

  // Nur GET cachen
  if (req.method !== 'GET') return;

  // 1) API/JSON: Network-first, Fallback Cache
  if (req.headers.get('accept')?.includes('application/json')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(API_CACHE).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(() => caches.match(req))
    );
    return;
  }

  // 2) Bilder: Cache-first, dynamisches Caching + Größenlimit
  if (req.destination === 'image') {
    event.respondWith(
      caches.match(req).then(cached => {
        if (cached) return cached;
        return fetch(req)
          .then(res => {
            const resClone = res.clone();
            caches.open(IMAGE_CACHE).then(cache => {
              cache.put(req, resClone);
              limitCacheSize(IMAGE_CACHE, 100); // max. 100 Bilder
            });
            return res;
          })
          .catch(() => caches.match('./icon-192.png')); // Fallback-Bild
      })
    );
    return;
  }

  // 3) Statische Seiten/Assets: Cache-first, Fallback index.html
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(() => {
          if (req.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});
