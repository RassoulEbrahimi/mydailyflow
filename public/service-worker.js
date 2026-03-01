// ─── Cache versioning ────────────────────────────────────────────────────────
// Bump CACHE_VERSION whenever you ship a new build.
const CACHE_VERSION = 'v3';
const CACHE_NAME = `mydailyflow-${CACHE_VERSION}`;

// Minimal app shell that must be available offline
const PRECACHE_URLS = [
    '/mydailyflow/',
    '/mydailyflow/index.html',
];

// ─── Install ─────────────────────────────────────────────────────────────────
// Precache the app shell and activate immediately (don't wait for old tabs).
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

// ─── Activate ────────────────────────────────────────────────────────────────
// Remove every cache whose name is not the current CACHE_NAME, then claim
// all existing clients so they immediately use this new worker.
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((cacheNames) =>
                Promise.all(
                    cacheNames
                        .filter((name) => name !== CACHE_NAME)
                        .map((name) => caches.delete(name))
                )
            )
            .then(() => self.clients.claim())
    );
});

// ─── Fetch ───────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle same-origin requests; let cross-origin requests pass through.
    if (url.origin !== self.location.origin) return;

    // ── Navigation (HTML pages) → Network-first with cache fallback ───────────
    // Always try to fetch the freshest HTML from the network so deployments
    // are picked up immediately. Fall back to the cached shell when offline.
    if (
        request.mode === 'navigate' ||
        request.headers.get('Accept')?.includes('text/html')
    ) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    // Update the cache with the fresh response
                    const clone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    return networkResponse;
                })
                .catch(() =>
                    // Offline → serve cached shell
                    caches.match(request)
                        .then((cached) => cached || caches.match('/mydailyflow/index.html'))
                )
        );
        return;
    }

    // ── Static assets (JS, CSS, images, fonts) → Stale-while-revalidate ──────
    // Serve from cache immediately for speed, then refresh the cache entry
    // in the background so the next visit gets the latest asset.
    const isStaticAsset = /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot)(\?.*)?$/.test(url.pathname);
    if (isStaticAsset) {
        event.respondWith(
            caches.open(CACHE_NAME).then((cache) =>
                cache.match(request).then((cachedResponse) => {
                    const fetchPromise = fetch(request).then((networkResponse) => {
                        cache.put(request, networkResponse.clone());
                        return networkResponse;
                    });
                    // Return cached copy immediately; revalidate in background
                    return cachedResponse || fetchPromise;
                })
            )
        );
        return;
    }

    // ── Everything else → Network only (API calls, analytics, etc.) ───────────
    // No special handling; let the browser deal with it normally.
});
