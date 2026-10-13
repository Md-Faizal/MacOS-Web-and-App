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
const ASSET_CACHE = 'asset-cache-v6';
const IMAGE_CACHE = 'image-cache-v4';
const VIDEO_CACHE = 'video-cache-v3';  // Incremented for new logic

// Enterprise Telemetry Gating for Service Worker
let DEBUG_SW = false;
const swLog = {
  log: (...args) => { if (DEBUG_SW) console.log('[SW]', ...args); },
  warn: (...args) => console.warn('[SW]', ...args),
  error: (...args) => console.error('[SW]', ...args)
};

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
  swLog.log('Install event triggered');
  
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => {
      swLog.log('Caching critical assets...');
      return cache.addAll(URLS_TO_CACHE).then(
        () => swLog.log('Critical assets cached'),
        (err) => swLog.warn('Some assets failed to cache:', err)
      );
    })
  );
  
  self.skipWaiting();
});

/**
 * Activate event - update cache version, clean old caches
 */
self.addEventListener('activate', (event) => {
  swLog.log('Activate event triggered');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      swLog.log('Cleaning old caches:', cacheNames);
      
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old cache versions
          if (
            cacheName !== CACHE_VERSION &&
            cacheName !== ASSET_CACHE &&
            cacheName !== IMAGE_CACHE &&
            cacheName !== VIDEO_CACHE
          ) {
            swLog.log('Deleting old cache:', cacheName);
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

  // Business data and event streams must always pass through to the server.
  if (url.pathname.startsWith('/api/')) {
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

  // Videos: Aggressive Cache-First (cache locally for instant playback)
  const isVideo = false; // Bypassed entirely above, handled natively by browser to prevent Range 206 caching errors


  // Images: Cache-First (try cache first, fetch if needed)
  if (request.destination === 'image' || url.pathname.includes('/Images/')) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then((cache) => {
        return cache.match(request).then((response) => {
          if (response) {
            swLog.log(`Image (${url.pathname}): CACHE HIT`);
            return response;
          }

          swLog.log(`Image (${url.pathname}): CACHE MISS, fetching...`);
          
          return fetch(request).then((networkResponse) => {
            // Cache successful responses
            if (networkResponse && networkResponse.status === 200) {
              cache.put(request, networkResponse.clone());
              swLog.log(`Image cached: ${url.pathname}`);
            }
            return networkResponse;
          }).catch((err) => {
            swLog.warn('Image fetch failed:', url.pathname, err);
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
              swLog.log(`Asset cached: ${url.pathname}`);
              return response;
            });
          }
          return response;
        })
        .catch(() => {
          // Fallback to cache on network error
          swLog.log(`Asset fetch failed (${url.pathname}), using cache`);
          return caches.match(request).then((response) => {
            if (response) {
              swLog.log(`Asset found in cache: ${url.pathname}`);
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
  swLog.log('Sync event:', event.tag);
  
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
                  swLog.log('Wallpaper preferences synced');
                  resolve();
                })
                .catch(err => {
                  swLog.error('Sync failed:', err);
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
  if (event.data?.type === 'MACOS_SET_DEBUG') {
    DEBUG_SW = Boolean(event.data.enabled);
    return;
  }

  swLog.log('Message received:', event.data);
  
  if (event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  
  if (event.data.type === 'CLEAR_CACHE') {
    caches.keys().then(names =>
      Promise.all(names.map(name => {
        swLog.log('Clearing cache:', name);
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
        swLog.log('Total cache size:', Math.round(totalSize / 1024 / 1024) + 'MB');
        event.ports[0].postMessage({
          type: 'CACHE_SIZE',
          size: totalSize
        });
      })
    );
  }
});

// Log service worker activation
swLog.log('Service Worker script loaded');
