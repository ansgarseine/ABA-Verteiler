// sw.js – Service Worker für Verteiler-Bestandsaufnahme
// Version hochzählen bei Änderungen, damit der Cache erneuert wird
const CACHE_NAME = 'verteiler-v1';

// Alle Dateien die offline verfügbar sein sollen
const ASSETS = [
  './',
  './index.html',
  './manifest.json'
];

// Installation: Dateien in den Cache laden
self.addEventListener('install', event => {
  console.log('[SW] Installiere Cache:', CACHE_NAME);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(ASSETS);
    }).then(() => {
      // Sofort aktivieren, nicht auf alten SW warten
      return self.skipWaiting();
    })
  );
});

// Aktivierung: Alte Caches löschen
self.addEventListener('activate', event => {
  console.log('[SW] Aktiviert:', CACHE_NAME);
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SW] Lösche alten Cache:', key);
            return caches.delete(key);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch: Cache-first Strategie (offline-first)
self.addEventListener('fetch', event => {
  // Nur GET-Anfragen cachen
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      if (cachedResponse) {
        // Aus Cache liefern, im Hintergrund aktualisieren
        const fetchPromise = fetch(event.request).then(networkResponse => {
          if (networkResponse && networkResponse.status === 200) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then(cache => {
              cache.put(event.request, responseClone);
            });
          }
          return networkResponse;
        }).catch(() => cachedResponse);

        return cachedResponse;
      }

      // Nicht im Cache: Netzwerk versuchen, dann cachen
      return fetch(event.request).then(networkResponse => {
        if (!networkResponse || networkResponse.status !== 200) {
          return networkResponse;
        }
        const responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
        return networkResponse;
      }).catch(() => {
        // Fallback: index.html zurückgeben wenn komplett offline
        return caches.match('./index.html');
      });
    })
  );
});
