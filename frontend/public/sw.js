// MODULE 14 - Offline-first app shell.
//
// Deliberately simple (no Workbox/build-time precache manifest): caches the
// app shell (HTML/JS/CSS/icons) same-origin GETs with a stale-while-revalidate
// strategy, so the dashboard and field-report form can still open with no
// network. It never intercepts API calls (those go to a different origin -
// the backend on :3000 - so this SW naturally leaves them alone); the
// field-report OFFLINE QUEUE itself is handled in app code via IndexedDB
// (see src/offline/db.js), not here.

const CACHE_NAME = 'sih26002-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // leave API calls (different origin) alone

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const network = fetch(request)
          .then((response) => {
            if (response && response.ok) cache.put(request, response.clone());
            return response;
          })
          .catch(() => cached);
        return cached || network;
      })
    )
  );
});
