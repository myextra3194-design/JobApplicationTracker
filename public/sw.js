/*
 * Job Application Tracker — app-shell service worker.
 *
 * Hand-written on purpose: the app is a single static bundle (Vite-hashed assets
 * are immutable), so a small shell cache beats pulling in a PWA plugin. This
 * caches HTTP responses only — it never touches localStorage or IndexedDB, which
 * belong to the app's own storage seam (src/lib/storage).
 *
 * Bump CACHE_VERSION on every deploy that must replace a broken shell.
 */

const CACHE_VERSION = 'jat-v3';

// Precached so a fresh install can launch once with the network unavailable.
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_VERSION)
      .then((cache) => Promise.all(SHELL.map((url) => cache.add(url).catch(() => undefined))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    // Pages: network-first so updates land, fall back to the cached shell offline.
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          void caches.open(CACHE_VERSION).then((cache) => cache.put('./index.html', copy));
          return response;
        })
        .catch(async () => (await caches.match('./index.html')) ?? Response.error()),
    );
    return;
  }

  // Everything else (hashed JS/CSS/icons): stale-while-revalidate. A cache hit
  // paints instantly; the background refill keeps the next launch current.
  event.respondWith(
    caches.match(request).then((cached) => {
      const fromNetwork = fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            void caches.open(CACHE_VERSION).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? fromNetwork;
    }),
  );
});
