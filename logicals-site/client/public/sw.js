/**
 * Offline support for the Home Screen app.
 *
 * Puzzles are generated in the browser - fetchBooklet never touches the network
 * - so solo play and the daily puzzle need nothing but the app itself. Without
 * a service worker a standalone window has no address bar to retry with, so a
 * moment of bad signal is a blank screen with no way out.
 *
 * Runtime caching rather than a precache manifest: the built asset names are
 * hashed and only known to the bundler, and a hand-maintained list would rot
 * silently. The first online visit fills the cache; every visit after that
 * works offline.
 */

const CACHE = 'logicals-shell-v1';
const SHELL = '/index.html';

self.addEventListener('install', event => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        // Best effort: a failure here must not leave the worker uninstalled.
        await cache.addAll([SHELL, '/manifest.webmanifest']).catch(() => {});
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', event => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name !== CACHE).map(name => caches.delete(name)));
        await self.clients.claim();
    })());
});

/** Puts a copy in the cache without making the response wait for it. */
async function remember(request, response) {
    if (!response || !response.ok || response.type === 'opaque') return;
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone()).catch(() => {});
}

self.addEventListener('fetch', event => {
    const request = event.request;
    if (request.method !== 'GET') return;

    const url = new URL(request.url);
    if (url.origin !== self.location.origin) return;

    /*
     * Never the API. Rooms, results and the opponent's progress are live state;
     * a cached answer would be worse than an error, and a duel would be played
     * against a snapshot.
     */
    if (url.pathname.startsWith('/api/')) return;

    // Navigations: network first, so a new deploy is picked up on the next
    // launch, with the cached shell as the fallback that makes it start at all.
    if (request.mode === 'navigate') {
        event.respondWith((async () => {
            try {
                const response = await fetch(request);
                event.waitUntil(remember(new Request(SHELL), response));
                return response;
            } catch {
                return (await caches.match(SHELL)) ?? Response.error();
            }
        })());
        return;
    }

    // Everything else is a build artefact under a hashed name, so a hit is
    // always the right answer and a miss is worth storing.
    event.respondWith((async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        event.waitUntil(remember(request, response));
        return response;
    })());
});
