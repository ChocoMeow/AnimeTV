/**
 * When the WAF serves a Cloudflare challenge, responses are usually HTML with 403/503/429.
 * App API errors use JSON — we only reload on HTML so e.g. /api/admin/check 403 stays safe.
 */
const STORAGE_KEY = 'cf-waf-reload-at'
const COOLDOWN_MS = 12_000
const PING_COOLDOWN_MS = 30 * 60 * 1000

let lastPingAt = 0

function isCloudflareHtmlBlock(res) {
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html')) return false
    return res.status === 403 || res.status === 503 || res.status === 429
}

function reloadOnce() {
    const now = Date.now()
    if (now - Number(sessionStorage.getItem(STORAGE_KEY) || 0) < COOLDOWN_MS) return
    sessionStorage.setItem(STORAGE_KEY, String(now))
    window.location.reload()
}

/** Only our tunnel/origin is behind the WAF; ignore third-party HTML errors. */
function isSameOriginRequest(input) {
    try {
        if (typeof input === 'string') return input.startsWith('/') || new URL(input, location.origin).origin === location.origin
        if (input instanceof URL) return input.origin === location.origin
        if (input instanceof Request) return new URL(input.url).origin === location.origin
    } catch {
        return false
    }
    return false
}

function ping() {
    if (!navigator.onLine) return  // Skip if offline
    const now = Date.now()
    if (now - lastPingAt < PING_COOLDOWN_MS) return
    lastPingAt = now
    globalThis.fetch(`/icons/icon_64x64.png?_=${now}`, { cache: 'no-store' })
        .then((res) => { if (isCloudflareHtmlBlock(res)) reloadOnce() })
        .catch(() => {})
}

export default defineNuxtPlugin({
    name: 'cloudflare-waf-recovery',
    enforce: 'post',
    setup() {
        const next = globalThis.fetch.bind(globalThis)
        globalThis.fetch = async (input, init) => {
            const res = await next(input, init)
            if (isSameOriginRequest(input) && isCloudflareHtmlBlock(res)) reloadOnce()
            return res
        }

        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') ping()
        })

        window.addEventListener('pageshow', (e) => {
            if (e.persisted) ping()
        })
    },
})
