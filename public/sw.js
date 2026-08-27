/*
 * Service worker for Chetu Microfinance.
 *
 * Its job here is narrow on purpose. A browser will only offer to install a web
 * app when a service worker with a fetch handler is registered, so without this
 * file the install prompt can never fire at all.
 *
 * It deliberately does NOT cache application code or API responses. This is a
 * financial system: a cached bundle would keep staff on an old version after a
 * deployment, and a cached response could show a stale balance as if it were
 * current. Everything goes to the network; only a tiny offline notice is held
 * locally, and it is shown only when a page navigation fails outright.
 */

const OFFLINE_URL = '/offline.html';
const CACHE = 'chetu-shell-v1';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll([OFFLINE_URL])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only page navigations get the offline fallback. Everything else — scripts,
  // styles, and every call to Supabase — is left entirely alone.
  if (request.mode !== 'navigate') return;

  event.respondWith(
    fetch(request).catch(() => caches.match(OFFLINE_URL).then((r) => r || Response.error())),
  );
});

// Tapping an alert focuses the app on the screen where the work is done,
// reusing an open window rather than piling up new tabs.
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(target).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
      return undefined;
    }),
  );
});
