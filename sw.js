const CACHE_NAME = 'omnistudy-cache-v2';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/config.js',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Use cache.addAll and catch errors to prevent installation blocking
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
  // CRITICAL: Only intercept GET requests. POST/PUT/DELETE will bypass and go to network directly.
  if (e.request.method !== 'GET') {
    return;
  }

  // Bypass Supabase API calls completely
  if (e.request.url.includes('supabase.co')) {
    return;
  }

  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }
      return fetch(e.request).then((response) => {
        // Dynamically cache successful external CDN script responses
        if (response.status === 200 && (e.request.url.includes('jsdelivr.net') || e.request.url.includes('unpkg.com'))) {
          return caches.open(CACHE_NAME).then((cache) => {
            cache.put(e.request, response.clone());
            return response;
          });
        }
        return response;
      });
    }).catch((err) => {
      console.error('Fetch failed in service worker:', err);
      // Fallback
    })
  );
});
