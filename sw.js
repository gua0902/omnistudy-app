const CACHE_NAME = 'omnistudy-cache-v3';
const ASSETS_TO_CACHE = [
  './',
  'index.html',
  'style.css',
  'app.js',
  'config.js',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE).catch(err => {
        console.warn('Pre-caching failed, but continuing install...', err);
      });
    })
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', (e) => {
  // 1. Only intercept GET requests. POST/PUT/DELETE bypass and go to network directly.
  if (e.request.method !== 'GET') {
    return;
  }

  // 2. Only intercept standard http/https requests (ignore chrome-extension, safari-extension, data, blob etc.)
  if (!e.request.url.startsWith('http')) {
    return;
  }

  // 3. Bypass Supabase API calls completely
  if (e.request.url.includes('supabase.co')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      // Fetch from network. DO NOT catch network errors and return undefined,
      // as that would trigger a browser "Cannot Connect" network page.
      return fetch(e.request).then((response) => {
        // Dynamically cache successful external CDN script responses
        if (response.status === 200 && (e.request.url.includes('jsdelivr.net') || e.request.url.includes('unpkg.com'))) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, responseClone);
          });
        }
        return response;
      });
    })
  );
});
