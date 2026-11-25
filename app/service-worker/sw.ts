/// <reference lib="webworker" />
/**
 * PWA service worker (injectManifest).
 * Warm opens: StaleWhileRevalidate serves a cached shell immediately.
 * Cold-start offline: failed document navigations must return /offline HTML
 * instead of the browser’s “not connected” page.
 */
import { cleanupOutdatedCaches, matchPrecache, precacheAndRoute } from 'workbox-precaching'
import { clientsClaim } from 'workbox-core'
import { registerRoute } from 'workbox-routing'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import { enable as enableNavigationPreload } from 'workbox-navigation-preload'

declare let self: ServiceWorkerGlobalScope

const OFFLINE = '/offline'
const WEEK = 60 * 60 * 24 * 7

self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()
clientsClaim()
enableNavigationPreload()

async function offlinePage(): Promise<Response | undefined> {
    // Nuxt may precache as `/offline` or `/offline/index.html`
    return (
        (await matchPrecache(OFFLINE))
        || (await matchPrecache(`${OFFLINE}/`))
        || (await matchPrecache(`${OFFLINE}/index.html`))
    )
}

async function offlineFallback(_request: Request): Promise<Response> {
    return (await offlinePage()) ?? new Response('Offline', { status: 503, statusText: 'Offline' })
}

registerRoute(
    ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
    new StaleWhileRevalidate({
        cacheName: 'app-pages',
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

// Welcome page still loads decorative Google Fonts via page-level useHead.
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
