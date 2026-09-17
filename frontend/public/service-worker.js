/**
 * Service Worker - Offline support, caching, background sync
 * 
 * Caching Strategies:
 * 1. API calls: Stale-While-Revalidate (serve cached, update in background)
 * 2. Assets: Network-First (try network, fallback to cache)
 * 3. Images: Cache-First (use cache, only fetch if missing)
 * 
 * Enables:
 * - Offline wallpaper access
 * - Instant repeat loads (cache hits)
 * - Background sync when coming back online
 */

const CACHE_VERSION = 'wallpaper-v6';
const API_CACHE = 'api-cache-v1';
const ASSET_CACHE = 'asset-cache-v4';
const IMAGE_CACHE = 'image-cache-v4';
const VIDEO_CACHE = 'video-cache-v3';  // Incremented for new logic

// Assets to cache on install - Updated for modular system
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/home.html',
  '/manifest.json'
];

/**
 * Install event - cache critical assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Install event triggered');
  
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      console.log('[SW] Caching critical assets...');
      return cache.addAll(URLS_TO_CACHE).then(
        () => console.log('[SW] Critical assets cached'),
        (err) => console.warn('[SW] Some assets failed to cache:', err)
      );
    })
  );
  
  self.skipWaiting();
});

/**
 * Activate event - update cache version, clean old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[SW] Activate event triggered');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      console.log('[SW] Cleaning old caches:', cacheNames);
      
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old cache versions
          if (
            cacheName !== CACHE_VERSION &&
            cacheName !== API_CACHE &&
            cacheName !== ASSET_CACHE &&
            cacheName !== IMAGE_CACHE &&
            cacheName !== VIDEO_CACHE
          ) {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  
  self.clients.claim();
});

/**
 * Fetch event - implement caching strategies
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Auth, Profile, Health, and WebSocket/SSE endpoints: ALWAYS bypass SW (Network only)
  if (
    url.pathname.startsWith('/api/auth/') ||
    url.pathname.startsWith('/api/profile/') ||
    url.pathname === '/api/health' ||
    url.pathname.startsWith('/api/ws') ||
    url.pathname.startsWith('/api/sse') ||
    url.pathname.endsWith('.mp4') ||
    url.pathname.endsWith('.mov') ||
    url.pathname.endsWith('.webm')
  ) {
    return;
  }

  // Bypass cache if force=true is present
  if (url.searchParams.get('force') === 'true') {
    return;
  }

  // API calls: Stale-While-Revalidate
  // Serve from cache immediately, update in background
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      caches.open(API_CACHE).then((cache) => {
        return cache.match(request).then((response) => {
          console.log(`[SW] API Request (${url.pathname}):`, response ? 'CACHE HIT' : 'CACHE MISS');
          
          // Return cached response immediately
          const fetchPromise = fetch(request).then((networkResponse) => {
            // Update cache in background
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
              console.log(`[SW] API cache updated: ${url.pathname}`);
            }
            return networkResponse;
          }).catch((err) => {
            console.warn('[SW] Fetch failed:', url.pathname, err);
            return response || new Response(JSON.stringify({ error: 'Network unavailable' }), {
              status: 503,
              headers: { 'Content-Type': 'application/json' }
            });
          });
          
          // Return cached response first, or wait for fetch
          return response || fetchPromise;
        });
      })
    );
    return;
  }

  // Videos: Aggressive Cache-First (cache locally for instant playback)
  const isVideo = false; // Bypassed entirely above, handled natively by browser to prevent Range 206 caching errors


  // Images: Cache-First (try cache first, fetch if needed)
  if (request.destination === 'image' || url.pathname.includes('/Images/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            console.log(`[SW] Image (${url.pathname}): CACHE HIT`);
            return response;
          }

          console.log(`[SW] Image (${url.pathname}): CACHE MISS, fetching...`);
          
          return fetch(request).then((networkResponse) => {
            // Cache successful responses
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
              console.log(`[SW] Image cached: ${url.pathname}`);
            }
            return networkResponse;
          }).catch((err) => {
            console.warn('[SW] Image fetch failed:', url.pathname, err);
            // Return offline placeholder if available
            return new Response(
              '<svg><text>Offline</text></svg>',
              { headers: { 'Content-Type': 'image/svg+xml' } }
            );
          });
        });
      })
    );
    return;
  }

  // Static assets: Network-First (try network, fallback to cache)
  const isMedia = request.destination === 'image' || 
                  request.destination === 'video' || 
                  url.pathname.match(/\.(jpg|jpeg|png|gif|svg|webp|mp4|webm|mov)$/i);

  if (
    url.pathname.includes('/frontend/') ||
    url.pathname.includes('/node_modules/') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.css')
  ) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response && response.status === 200) {
            return caches.open(ASSET_CACHE).then((cache) => {
              cache.put(request, response.clone());
              console.log(`[SW] Asset cached: ${url.pathname}`);
              return response;
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache on network error
          console.log(`[SW] Asset fetch failed (${url.pathname}), using cache`);
          return caches.match(request).then((response) => {
            if (response) {
              console.log(`[SW] Asset found in cache: ${url.pathname}`);
              return response;
            }
            
            // Return offline page ONLY for documents
            if (request.destination === 'document') {
              return caches.match('/offline.html').catch(() => {
                return new Response('Offline', { status: 503 });
              });
            }
            
            // For images/scripts, return a proper failure
            return new Response('Not found', { status: 404 });
          });
        })
    );
    return;
  }

  // HTML documents: Network-First with long cache
  if (request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(ASSET_CACHE).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).catch(() => {
            return new Response('Page not available offline', { status: 503 });
          });
        })
    );
    return;
  }
});

/**
 * Background Sync - sync wallpaper preferences when coming back online
 */
self.addEventListener('sync', (event) => {
  console.log('[SW] Sync event:', event.tag);
  
  if (event.tag === 'sync-wallpaper-prefs') {
    event.waitUntil(
      // Get current wallpaper from modular cache database
      new Promise((resolve) => {
        const DB_NAME = 'WallpaperCacheDB';
        const request = indexedDB.open(DB_NAME, 2);
        request.onsuccess = () => {
          const db = request.result;
          const txn = db.transaction('status_store', 'readonly');
          const store = txn.objectStore('status_store');
          const query = store.get('current');
          
          query.onsuccess = () => {
            const wallpaper = query.result;
            if (wallpaper) {
              // Sync to server
              fetch('/api/user/wallpaper-preferences', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(wallpaper)
              })
                .then(res => {
                  console.log('[SW] Wallpaper preferences synced');
                  resolve();
                })
                .catch(err => {
                  console.error('[SW] Sync failed:', err);
                  resolve();  // Resolve to mark as attempted
                });
            } else {
              resolve();
            }
          };
        };
        request.onerror = () => resolve();
      })
    );
  }
});

/**
 * Message handling - receive messages from pages
 */
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names =>
      Promise.all(names.map(name => {
        console.log('[SW] Clearing cache:', name);
        return caches.delete(name);
      }))
    );
  }
  
  if (event.data.type === 'GET_CACHE_SIZE') {
    let totalSize = 0;
    caches.keys().then(names =>
      Promise.all(
        names.map(name =>
          caches.open(name).then(cache =>
            cache.keys().then(requests =>
              Promise.all(
                requests.map(request =>
                  cache.match(request).then(response => {
                    if (response) {
                      totalSize += response.headers.get('content-length') || 0;
                    }
                  })
                )
              )
            )
          )
        )
      ).then(() => {
        console.log('[SW] Total cache size:', Math.round(totalSize / 1024 / 1024) + 'MB');
        event.ports[0].postMessage({
          type: 'CACHE_SIZE',
          size: totalSize
        });
      })
    );
  }
});

// Log service worker activation
console.log('[SW] Service Worker script loaded');
