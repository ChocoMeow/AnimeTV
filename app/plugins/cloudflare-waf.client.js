/**
 * Recover when Cloudflare WAF serves a challenge page (HTML) on API calls.
 * App API errors use JSON — we only reload after confirming challenge markers.
 * No periodic probes (those triggered extra challenges and broke long video sessions).
 */
const STORAGE_KEY = 'cf-waf-reload-at'
const COOLDOWN_MS = 12_000

/** Video/HLS traffic must never trigger a full-page reload. */
const SKIP_API_PATH = /^\/api\/(?:proxy-video|download-proxy|download-video)/

const CF_CHALLENGE_RE = /cf-challenge|challenge-platform|cdn-cgi\/challenge|__cf_chl/i

let pendingReload = false

function requestUrl(input) {
    try {
        if (typeof input === 'string') return new URL(input, location.origin)
        if (input instanceof URL) return input
        if (input instanceof Request) return new URL(input.url)
    } catch {
        return null
    }
    return null
}

function isRecoverableApiRequest(input) {
    const url = requestUrl(input)
    if (!url || url.origin !== location.origin) return false
    if (!url.pathname.startsWith('/api/')) return false
    if (SKIP_API_PATH.test(url.pathname)) return false
    return true
}

function isMediaPlaybackActive() {
    const video = document.querySelector('video')
    return !!(video && !video.paused && !video.ended && video.readyState > 2)
}

async function isCloudflareChallengeResponse(res) {
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html')) return false
    if (res.status !== 403 && res.status !== 503 && res.status !== 429) return false
    try {
        const snippet = await res.clone().text()
        return CF_CHALLENGE_RE.test(snippet.slice(0, 4096))
    } catch {
        return false
    }
}

function reloadOnce() {
    const now = Date.now()
    if (now - Number(sessionStorage.getItem(STORAGE_KEY) || 0) < COOLDOWN_MS) return
    sessionStorage.setItem(STORAGE_KEY, String(now))
    window.location.reload()
}

function scheduleReload() {
    if (isMediaPlaybackActive()) {
        pendingReload = true
        return
    }
    reloadOnce()
}

function tryPendingReload() {
    if (!pendingReload || isMediaPlaybackActive()) return
    pendingReload = false
    reloadOnce()
}

export default defineNuxtPlugin({
    name: 'cloudflare-waf-recovery',
    enforce: 'post',
    setup() {
        document.addEventListener('pause', tryPendingReload, true)
        document.addEventListener('ended', tryPendingReload, true)

        const next = globalThis.fetch.bind(globalThis)
        globalThis.fetch = async (input, init) => {
            const res = await next(input, init)
            if (isRecoverableApiRequest(input) && await isCloudflareChallengeResponse(res)) {
                scheduleReload()
            }
            return res
        }
    },
})
