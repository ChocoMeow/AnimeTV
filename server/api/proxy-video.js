// server/api/proxy-video.js

import { createLoggedError } from '~~/server/utils/logger'

const DEFAULT_CHUNK_SIZE = 1 * 1024 * 1024 // 1 MB initial chunk
const MAX_PASSTHROUGH_SIZE = 2 * 1024 * 1024 // 2 MB per response, hard cap
const METADATA_CACHE_MAX = 500
const METADATA_CACHE_TTL = 600_000 // 10 min
const UPSTREAM_TIMEOUT = 30_000
const MAX_RETRIES = 3
const RETRY_BASE_DELAY = 500

const metadataCache = new Map()

const BROWSER_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    Accept: 'video/webm,video/ogg,video/*;q=0.9,*/*;q=0.5',
    'Accept-Encoding': 'identity',
}

const IMMUTABLE_CACHE = {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'CDN-Cache-Control': 'public, max-age=31536000',
    'Vercel-CDN-Cache-Control': 'public, max-age=31536000',
}

const CORS_HEADERS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range',
    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
}

const isM3u8 = (url) => /\.m3u8(\?|$)/i.test(url) || url.toLowerCase().includes('m3u8')
const isSegment = (url, parsed) => /\.ts(\?|$)/i.test(parsed.pathname) || url.toLowerCase().includes('.ts')
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ─── Upstream fetch helpers ─────────────────────────────────────────────────

// Combines the client's own abort signal with a per-attempt timeout, natively —
// no manual AbortController plumbing.
function upstreamFetch(url, { method = 'GET', cookie, headers = {}, signal, timeout = UPSTREAM_TIMEOUT }) {
    const combined = AbortSignal.any([signal, AbortSignal.timeout(timeout)])
    return fetch(url, {
        method,
        redirect: 'follow',
        signal: combined,
        headers: { Cookie: cookie, ...BROWSER_HEADERS, ...headers },
    })
}

function isRetryableError(err, clientSignal) {
    if (clientSignal?.aborted) return false // client is gone — never retry on their behalf
    if (!err) return false
    if (err.name === 'TimeoutError') return true
    if (err.name === 'AbortError') return false
    const haystack = `${err.code || ''} ${err.message || ''}`
    return ['ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE', 'ConnectionRefused', 'ConnectionReset', 'ConnectionClosed'].some((c) => haystack.includes(c))
}

async function fetchWithRetry(url, opts, attempt = 1) {
    try {
        const res = await upstreamFetch(url, opts)
        if ((res.status >= 500 || res.status === 408) && attempt < MAX_RETRIES) {
            await sleep(RETRY_BASE_DELAY * attempt)
            return fetchWithRetry(url, opts, attempt + 1)
        }
        return res
    } catch (err) {
        if (isRetryableError(err, opts.signal) && attempt < MAX_RETRIES) {
            await sleep(RETRY_BASE_DELAY * attempt)
            return fetchWithRetry(url, opts, attempt + 1)
        }
        throw err
    }
}

// ─── Main Handler ────────────────────────────────────────────────────────────

export default defineEventHandler(async (event) => {
    try {
        await authUser(event)

        const { url: videoUrl, cookie, redirect: wantsRedirect } = getQuery(event)
        if (!videoUrl || !cookie) {
            throw createError({ statusCode: 400, statusMessage: 'Missing parameters' })
        }

        // Tied directly to the client connection — the instant the browser cancels
        // (seek, tab close, skip to next episode) this fires, and every upstream
        // fetch below aborts in the same tick instead of finishing pointlessly.
        const clientAbort = new AbortController()
        event.node.req.on('close', () => clientAbort.abort())
        event.node.req.on('error', () => clientAbort.abort())

        if (wantsRedirect === 'true') return await handleRedirect(event, videoUrl, cookie, clientAbort.signal)

        let parsedUrl
        try {
            parsedUrl = new URL(videoUrl)
        } catch {
            throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
        }

        if (isM3u8(videoUrl)) return await handleM3u8(videoUrl, cookie, clientAbort.signal, event)
        if (isSegment(videoUrl, parsedUrl)) return await handleSegment(videoUrl, cookie, clientAbort.signal, event)

        return await handleProgressive(videoUrl, cookie, clientAbort.signal, event)
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        if (err?.data?.errorId) throw err
        if (err?.name === 'AbortError') throw err
        throw createLoggedError(event, {
            statusCode: err?.statusCode || 502,
            statusMessage: err?.statusMessage || 'Video proxy error',
            err,
            context: { module: 'proxy-video' },
        })
    }
})

// ─── Progressive MP4 / byte-range streaming ─────────────────────────────────

async function handleProgressive(videoUrl, cookie, signal, event) {
    const cacheKey = `${videoUrl}:${cookie}`
    let headInfo = metadataCache.get(cacheKey)

    if (!headInfo || Date.now() - headInfo.timestamp > METADATA_CACHE_TTL) {
        headInfo = await getVideoInfo(videoUrl, cookie, signal)
        if (headInfo.success) {
            headInfo.timestamp = Date.now()
            metadataCache.set(cacheKey, headInfo)
            if (metadataCache.size > METADATA_CACHE_MAX) metadataCache.delete(metadataCache.keys().next().value)
        }
    }

        if (!headInfo.success) {
            throw createLoggedError(event, {
                statusCode: headInfo.statusCode || 502,
                statusMessage: headInfo.error || 'Video metadata failed',
                context: { module: 'proxy-video', stage: 'head' },
            })
        }

    const { contentLength: totalSize, acceptsRanges: supportsRange, directUrl, contentType } = headInfo

    // Small file → hand the browser the source URL directly and skip the proxy.
    if (totalSize < 10 * 1024 * 1024 && directUrl) {
        setResponseStatus(event, 302)
        setResponseHeader(event, 'Location', directUrl)
        return ''
    }

    const rangeHeader = getHeader(event, 'range')
    let start = 0
    let end = totalSize - 1

    if (rangeHeader && supportsRange) {
        const [s, e] = rangeHeader.replace(/bytes=/, '').split('-')
        start = parseInt(s, 10) || 0
        end = e ? parseInt(e, 10) : Math.min(start + MAX_PASSTHROUGH_SIZE - 1, totalSize - 1)
    } else if (supportsRange) {
        end = Math.min(start + DEFAULT_CHUNK_SIZE - 1, totalSize - 1)
    }
    if (supportsRange && end - start + 1 > MAX_PASSTHROUGH_SIZE) end = start + MAX_PASSTHROUGH_SIZE - 1

    const chunkSize = end - start + 1
    const statusCode = supportsRange ? 206 : 200

    setResponseStatus(event, statusCode)
    setResponseHeader(event, 'Content-Type', contentType || 'video/mp4')
    setResponseHeader(event, 'Accept-Ranges', 'bytes')
    setResponseHeader(event, 'Vary', 'Range')
    for (const [k, v] of Object.entries({ ...IMMUTABLE_CACHE, ...CORS_HEADERS })) setResponseHeader(event, k, v)
    if (statusCode === 206) {
        setResponseHeader(event, 'Content-Range', `bytes ${start}-${end}/${totalSize}`)
        setResponseHeader(event, 'Content-Length', String(chunkSize))
    }

    return sendStream(event, resilientRangeStream(videoUrl, cookie, start, end, signal))
}

// A ReadableStream over [start, end] that resumes with an adjusted Range
// request if the upstream connection drops partway through, instead of
// failing the whole chunk.
//
// IMPORTANT: `pull()` enqueues exactly ONE read per call and returns. This is
// what makes backpressure actually work — the stream only calls `pull()`
// again once its internal queue has room, which in turn only happens once
// the client has actually drained previously-sent bytes. Do NOT loop reading
// the whole range inside a single `pull()` call: that stuffs the entire
// chunk into memory up front regardless of how fast the client can consume
// it, which is exactly what caused the memory blow-up under concurrent load.
function resilientRangeStream(url, cookie, start, end, signal) {
    const total = end - start + 1
    let delivered = 0
    let cursor = start
    let reader = null
    let attempt = 0

    async function ensureReader() {
        if (reader) return reader
        while (attempt <= MAX_RETRIES) {
            if (signal.aborted) return null
            try {
                const res = await fetchWithRetry(url, {
                    cookie,
                    signal,
                    headers: { Range: `bytes=${cursor}-${end}` },
                })
                if (!res.ok && res.status !== 206) throw createError({ statusCode: res.status, statusMessage: 'Video stream error' })
                if (!res.body) throw new Error('Empty upstream body')
                reader = res.body.getReader()
                attempt = 0 // reset backoff once we're actually receiving bytes
                return reader
            } catch (err) {
                if (signal.aborted) return null
                attempt++
                if (attempt > MAX_RETRIES) throw err
                await sleep(RETRY_BASE_DELAY * attempt)
            }
        }
        return null
    }

    return new ReadableStream({
        async pull(controller) {
            if (signal.aborted) return controller.close()
            if (delivered >= total) return controller.close()

            try {
                const r = await ensureReader()
                if (!r) return controller.close()

                const { done, value } = await r.read()
                if (done) {
                    // Upstream closed before delivering the full range — drop the
                    // reader and let the *next* pull() reconnect from `cursor`.
                    reader = null
                    if (delivered >= total) controller.close()
                    return
                }

                controller.enqueue(value)
                delivered += value.byteLength
                cursor += value.byteLength
            } catch (err) {
                if (signal.aborted) return controller.close()
                controller.error(err)
            }
        },
        cancel() {
            reader?.cancel().catch(() => {})
            reader = null
        },
    })
}

// ─── HLS / M3U8 ───────────────────────────────────────────────────────────────

async function handleM3u8(playlistUrl, cookie, signal, event) {
    const res = await fetchWithRetry(playlistUrl, { cookie, signal })
    if (!res.ok) {
        throw createLoggedError(event, {
            statusCode: 502,
            statusMessage: 'Failed to fetch m3u8',
            context: { module: 'proxy-video', stage: 'm3u8', status: res.status },
        })
    }
    const body = await res.text()

    const baseUrl = new URL(playlistUrl)
    const proxyBase = getRequestURL(event).origin + '/api/proxy-video'
    const encodedCookie = encodeURIComponent(cookie)

    const out = body.split(/\r?\n/).map((line) => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return line
        try {
            const abs = new URL(t, baseUrl).toString()
            return `${proxyBase}?url=${encodeURIComponent(abs)}&cookie=${encodedCookie}`
        } catch {
            return line
        }
    })

    setResponseHeader(event, 'Content-Type', 'application/vnd.apple.mpegurl')
    setResponseHeader(event, 'Cache-Control', 'public, max-age=30, stale-while-revalidate=30')
    setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
    return out.join('\n')
}

// ─── HLS Segment (.ts) ─────────────────────────────────────────────────────────

async function handleSegment(segmentUrl, cookie, signal, event) {
    const targetUrl = new URL(segmentUrl)
    const referer = targetUrl.hostname.includes('anime1.me') ? 'https://anime1.me/' : targetUrl.origin + '/'

    const res = await fetchWithRetry(segmentUrl, {
        cookie,
        signal,
        headers: { Accept: '*/*', Referer: referer },
    })

    if (!res.ok) {
        throw createLoggedError(event, {
            statusCode: res.status >= 400 ? res.status : 502,
            statusMessage: 'Segment failed',
            context: { module: 'proxy-video', stage: 'segment', status: res.status },
        })
    }
    if (!res.body) {
        throw createLoggedError(event, {
            statusCode: 502,
            statusMessage: 'Empty segment body',
            context: { module: 'proxy-video', stage: 'segment' },
        })
    }

    setResponseStatus(event, res.status)
    setResponseHeader(event, 'Content-Type', res.headers.get('content-type') || 'video/mp2t')
    setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
    setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
    const len = res.headers.get('content-length')
    if (len) setResponseHeader(event, 'Content-Length', len)
    const range = res.headers.get('content-range')
    if (range) setResponseHeader(event, 'Content-Range', range)

    return sendStream(event, res.body)
}

// ─── Redirect resolver ───────────────────────────────────────────────────────

async function handleRedirect(event, videoUrl, cookie, signal) {
    try {
        const res = await fetchWithRetry(videoUrl, { cookie, signal, method: 'HEAD' })
        if (!res.ok) {
            throw createLoggedError(event, {
                statusCode: 502,
                statusMessage: 'Could not resolve video URL',
                context: { module: 'proxy-video', stage: 'redirect', status: res.status },
            })
        }
        return { success: true, url: res.url || videoUrl, message: 'Use this URL to stream directly and save bandwidth' }
    } catch (err) {
        if (err?.data?.errorId) throw err
        throw createLoggedError(event, {
            statusCode: err.statusCode || 502,
            statusMessage: err.statusMessage || 'Could not resolve video URL',
            err,
            context: { module: 'proxy-video', stage: 'redirect' },
        })
    }
}

// ─── Video metadata via HEAD ─────────────────────────────────────────────────

async function getVideoInfo(videoUrl, cookie, signal) {
    try {
        const res = await fetchWithRetry(videoUrl, { cookie, signal, method: 'HEAD', headers: { Accept: 'video/*' } })
        if (!res.ok) return { success: false, error: `HEAD request failed: ${res.status}`, statusCode: res.status }

        const contentLength = parseInt(res.headers.get('content-length'), 10)
        if (!contentLength || isNaN(contentLength)) return { success: false, error: 'Content-Length not available', statusCode: 500 }

        return {
            success: true,
            contentLength,
            acceptsRanges: res.headers.get('accept-ranges') === 'bytes',
            contentType: res.headers.get('content-type'),
            directUrl: res.url || videoUrl,
        }
    } catch (err) {
        return { success: false, error: err.message || 'Unknown', statusCode: 502 }
    }
}