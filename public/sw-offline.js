// Offline navigation fallback handler for MPA shells (/ and /admin).
// Sensitive API calls, Firestore queries, room credentials, wallet proofs, and media are never cached here.
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || req.mode !== 'navigate') {
    return;
  }

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) {
    return;
  }
  if (
    url.pathname.startsWith('/api/') ||
    url.pathname.startsWith('/video/') ||
    url.pathname.startsWith('/audio/')
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      try {
        const networkResponse = await fetch(req);
        if (networkResponse && networkResponse.ok) {
          return networkResponse;
        }
        return networkResponse;
      } catch {
        const isAdmin = url.pathname === '/admin' || url.pathname.startsWith('/admin/');
        const targetShell = isAdmin ? '/admin.html' : '/index.html';
        const cachedShell = await caches.match(targetShell, { ignoreSearch: true });
        if (cachedShell) {
          return cachedShell;
        }
        const offlinePage = await caches.match('/offline.html', { ignoreSearch: true });
        if (offlinePage) {
          return offlinePage;
        }
        return new Response('You are offline. Reconnect and try again.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }
    })(),
  );
});
