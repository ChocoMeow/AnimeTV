/// <reference lib="webworker" />
/**
 * PWA service worker (injectManifest).
 * - Navigations: SWR cached shell; offline → precached /offline
 * - Activate: drop app-pages so HTML matches new /_nuxt hashes after update
 */
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

const WEEK = 60 * 60 * 24 * 7

self.addEventListener('message', (e) => {
    if (e.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()
self.addEventListener('activate', (e) => e.waitUntil(caches.delete('app-pages')))

async function offlineFallback(): Promise<Response> {
    return (
        (await matchPrecache('/offline'))
        || (await matchPrecache('/offline/'))
        || (await matchPrecache('/offline/index.html'))
        || new Response('Offline', { status: 503, statusText: 'Offline' })
    )
}

registerRoute(
    ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
    new StaleWhileRevalidate({
        cacheName: 'app-pages',
        matchOptions: { ignoreVary: true, ignoreSearch: true },
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: WEEK }),
            { handlerDidError: () => offlineFallback() },
        ],
    }),
)

registerRoute(
    ({ url, sameOrigin }) => sameOrigin && /^\/api\/anime\/[^/]+\/episodes$/i.test(url.pathname),
    new NetworkOnly(),
    'GET',
)

registerRoute(
    ({ url, sameOrigin }) => sameOrigin && /^\/api\/(anime|search|public\/welcome-preview)/i.test(url.pathname),
    new StaleWhileRevalidate({
        cacheName: 'anime-api',
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: WEEK })],
    }),
    'GET',
)

registerRoute(
    ({ url, sameOrigin }) => sameOrigin && /^\/api\/media\/(?:proxy|file|seek-vtt)/i.test(url.pathname),
    new NetworkOnly(),
    'GET',
)

registerRoute(
    /^https:\/\/fonts\.googleapis\.com\/.*/i,
    new StaleWhileRevalidate({
        cacheName: 'google-fonts-stylesheets',
        plugins: [new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 30 })],
    }),
    'GET',
)

registerRoute(
    /^https:\/\/fonts\.gstatic\.com\/.*/i,
    new CacheFirst({
        cacheName: 'google-fonts-webfonts',
        plugins: [
            new CacheableResponsePlugin({ statuses: [0, 200] }),
            new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }),
        ],
    }),
    'GET',
)
