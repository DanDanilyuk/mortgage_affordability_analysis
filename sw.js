// Service worker caching strategy:
//   - install precaches the shell bypassing the HTTP cache (Request cache: 'reload')
//     so a deploy that forgets to bump CACHE_VERSION still fetches fresh shell assets.
//   - navigations (HTML): network-first, fall back to cache offline.
//   - JSON data: stale-while-revalidate into DATA_CACHE.
//   - everything else (CSS, JS, fonts): stale-while-revalidate into SHELL_CACHE.
//   - skipWaiting() + clients.claim() activate the new SW immediately; the app.js
//     controllerchange handler reloads any open tab once so it can't run mixed assets.
// Bump CACHE_VERSION on any breaking change so old caches are evicted on activate.

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `shell-${CACHE_VERSION}`;
const DATA_CACHE = `data-${CACHE_VERSION}`;

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/app.js',
  '/modules/constants.js',
  '/modules/format.js',
  '/modules/events.js',
  '/favicon.svg',
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then(cache => cache.addAll(SHELL_ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== SHELL_CACHE && k !== DATA_CACHE)
          .map(k => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Network-first for HTML so content updates show up on next reload.
  if (request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname === '/') {
    event.respondWith(
      fetch(request)
        .then(resp => {
          const copy = resp.clone();
          caches.open(SHELL_CACHE).then(c => c.put(request, copy));
          return resp;
        })
        .catch(() => caches.match(request).then(r => r || caches.match('/')))
    );
    return;
  }

  // Stale-while-revalidate for JSON data.
  if (url.pathname.endsWith('.json')) {
    event.respondWith(
      caches.match(request).then(cached => {
        const network = fetch(request)
          .then(resp => {
            if (resp.ok) {
              const copy = resp.clone();
              caches.open(DATA_CACHE).then(c => c.put(request, copy));
            }
            return resp;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
    return;
  }

  // Stale-while-revalidate for everything else (CSS, JS, fonts).
  event.respondWith(
    caches.match(request).then(cached => {
      const network = fetch(request)
        .then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(SHELL_CACHE).then(c => c.put(request, copy));
          }
          return resp;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
