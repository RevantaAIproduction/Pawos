// Mobile Presence PWA service worker (MOB-4 foundation). Push payload
// handling/notificationclick routing is wired more fully in MOB-7
// (Notification Runtime) — this is the minimal, real, working shell: a push
// event shows a real OS notification, a click focuses/opens the app.
// Offline shell: caches the install-time app shell so /companion still
// renders (without live data) if opened with no connectivity, per the PWA
// spec's "Offline Shell" requirement — deliberately minimal (no full
// runtime caching strategy), matching this phase's "foundation" scope.

const OFFLINE_SHELL_CACHE = 'pawos-offline-shell-v1';
const OFFLINE_SHELL_URLS = ['/companion'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(OFFLINE_SHELL_CACHE)
      .then((cache) => cache.addAll(OFFLINE_SHELL_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== OFFLINE_SHELL_CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request).then((cached) => cached || caches.match('/companion')))
  );
});

self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'PawOS', body: event.data.text() };
  }
  const options = {
    body: payload.body,
    icon: payload.icon || '/logo-icon.png',
    badge: '/logo-icon.png',
    data: { url: payload.url || '/companion', eventType: payload.eventType },
  };
  event.waitUntil(self.registration.showNotification(payload.title || 'PawOS', options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/companion';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});
