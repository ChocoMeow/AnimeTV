/// <reference lib="webworker" />
/**
 * PWA service worker (injectManifest).
 * Cold-start offline: failed document navigations must return /offline HTML
 * instead of the browser’s “not connected” page.
 */
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheFirst, NetworkFirst, NetworkOnly } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

const OFFLINE = '/offline'
const WEEK = 60 * 60 * 24 * 7

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()

async function offlineFallback(request: Request): Promise<Response> {
    const path = new URL(request.url).pathname.replace(/\/$/, '') || '/'
    if (path === OFFLINE) {
        return (await matchPrecache(OFFLINE)) ?? new Response('Offline', { status: 503 })
    }
    return Response.redirect(OFFLINE, 302)
}

registerRoute(
    ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
    new NetworkFirst({
        cacheName: 'app-pages',
        networkTimeoutSeconds: 2,
        matchOptions: { ignoreVary: true, ignoreSearch: true },
        plugins: [
            new CacheableResponsePlugin({ statuses: [200] }),
            new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: WEEK }),
            { handlerDidError: async ({ request }) => offlineFallback(request) },
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
    new NetworkFirst({
        cacheName: 'anime-api',
        networkTimeoutSeconds: 2,
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: WEEK })],
    }),
    'GET',
)

registerRoute(
    ({ url, sameOrigin }) => sameOrigin && /^\/api\/(proxy-video|download-proxy)/i.test(url.pathname),
    new NetworkOnly(),
    'GET',
)

registerRoute(
    /^https:\/\/fonts\.googleapis\.com\/.*/i,
    new NetworkFirst({
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
