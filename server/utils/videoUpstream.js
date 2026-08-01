import { resolveVideoReferer } from '~~/server/lib/videoProviders'

const envInt = (key, fallback) => {
    const n = Number(process.env[key])
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback
}

/**
 * Upstream proxy knobs — low-RAM-friendly defaults.
 * Override with NUXT_VIDEO_PROXY_* env vars when needed.
 */
export const VIDEO_UPSTREAM = Object.freeze({
    chunkSize: envInt('NUXT_VIDEO_PROXY_CHUNK', 512 * 1024),
    maxChunk: envInt('NUXT_VIDEO_PROXY_MAX_CHUNK', 1024 * 1024),
    metaCacheMax: envInt('NUXT_VIDEO_PROXY_META_CACHE', 128),
    metaCacheTtlMs: 600_000,
    timeoutMs: envInt('NUXT_VIDEO_PROXY_TIMEOUT_MS', 25_000),
    maxRetries: envInt('NUXT_VIDEO_PROXY_RETRIES', 2),
    retryBaseDelayMs: 400,
    smallFileRedirectBytes: 10 * 1024 * 1024,
    maxRedirects: 5,
})

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

/** Provider-aware upstream headers (Referer from registry; Cookie only when set). */
export function videoUpstreamHeaders(targetUrl, { cookie = '', accept = '*/*', range } = {}) {
    let hostname = ''
    let origin = ''
    try {
        const u = typeof targetUrl === 'string' ? new URL(targetUrl) : targetUrl
        hostname = u.hostname
        origin = u.origin
    } catch {
        /* keep empty → resolveVideoReferer falls back */
    }

    const headers = {
        'User-Agent': UA,
        Accept: accept,
        'Accept-Encoding': 'identity',
        Referer: resolveVideoReferer(hostname, origin),
    }
    if (cookie) headers.Cookie = String(cookie)
    if (range) headers.Range = range
    return headers
}

export function isHlsPlaylist(url) {
    return /\.m3u8(\?|$)/i.test(url)
}

/** HLS media parts only — do not match progressive anime1 .mp4. */
export function isHlsSegment(url, pathname = '') {
    let path = pathname
    if (!path) {
        try {
            path = new URL(url).pathname
        } catch {
            path = url
        }
    }
    return /\.(m?ts|m4s|cmfv|aac)(\?|$)/i.test(path)
}

export function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms))
}

export function bindClientAbort(event) {
    const ac = new AbortController()
    const abort = () => {
        if (!ac.signal.aborted) ac.abort()
    }
    // Only abort upstream when the client drops before the response finishes.
    event.node.res.on('close', () => {
        if (!event.node.res.writableFinished) abort()
    })
    event.node.req.on('error', abort)
    return ac
}

export function combinedSignal(clientSignal, timeoutMs = VIDEO_UPSTREAM.timeoutMs) {
    return AbortSignal.any([clientSignal, AbortSignal.timeout(timeoutMs)])
}
