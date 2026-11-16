const CACHE_NAME = 'onemed-downtime-shell-v1';
const SAFE_SHELL_URLS = ['/offline.html', '/offline.css', '/downtime-forms.html', '/downtime-forms.css'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SAFE_SHELL_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith('onemed-downtime-shell-') && key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin === self.location.origin && SAFE_SHELL_URLS.includes(url.pathname)) {
    event.respondWith(caches.open(CACHE_NAME).then(async (cache) => (await cache.match(request)) || fetch(request)));
    return;
  }

  // The worker never writes application responses or API data to Cache Storage.
  event.respondWith(fetch(request).catch(async (error) => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    windows.forEach((client) => client.postMessage({ type: 'SYSTEM_UNREACHABLE' }));
    if (request.mode === 'navigate') {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match('/offline.html')) || new Response('SYSTEM UNREACHABLE — FOLLOW DOWNTIME PROCEDURE', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }
    throw error;
  }));
});
