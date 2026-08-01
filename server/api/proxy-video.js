import { createLoggedError } from '~~/server/utils/logger'
import {
    VIDEO_UPSTREAM,
    bindClientAbort,
    combinedSignal,
    isHlsPlaylist,
    isHlsSegment,
    sleep,
    videoUpstreamHeaders,
} from '~~/server/utils/videoUpstream'

const {
    chunkSize: DEFAULT_CHUNK_SIZE,
    maxChunk: MAX_PASSTHROUGH_SIZE,
    metaCacheMax: METADATA_CACHE_MAX,
    metaCacheTtlMs: METADATA_CACHE_TTL,
    timeoutMs: UPSTREAM_TIMEOUT,
    maxRetries: MAX_RETRIES,
    retryBaseDelayMs: RETRY_BASE_DELAY,
    smallFileRedirectBytes: SMALL_FILE_REDIRECT,
} = VIDEO_UPSTREAM

const metadataCache = new Map()

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

function setHeaders(event, headers) {
    for (const [k, v] of Object.entries(headers)) setResponseHeader(event, k, v)
}

function upstreamFetch(url, { method = 'GET', cookie, range, accept, signal, timeout = UPSTREAM_TIMEOUT }) {
    return fetch(url, {
        method,
        redirect: 'follow',
        signal: combinedSignal(signal, timeout),
        headers: videoUpstreamHeaders(url, { cookie, accept, range }),
    })
}

function isAbortError(err) {
    return (
        err?.name === 'AbortError' ||
        err?.code === 'ABORT_ERR' ||
        (typeof DOMException !== 'undefined' && err instanceof DOMException && err.name === 'AbortError') ||
        /operation was aborted/i.test(err?.message || '')
    )
}

function isRetryableError(err, clientSignal) {
    if (clientSignal?.aborted || !err || isAbortError(err)) return false
    if (err.name === 'TimeoutError') return true
    const haystack = `${err.code || ''} ${err.message || ''}`
    return /ECONNRESET|ECONNREFUSED|EHOSTUNREACH|EPIPE|ConnectionRefused|ConnectionReset|ConnectionClosed/i.test(
        haystack,
    )
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

function cacheHeadInfo(key, info) {
    info.timestamp = Date.now()
    metadataCache.set(key, info)
    while (metadataCache.size > METADATA_CACHE_MAX) {
        metadataCache.delete(metadataCache.keys().next().value)
    }
}

export default defineEventHandler(async (event) => {
    try {
        await authUser(event)

        const { url: videoUrl, cookie: cookieRaw, redirect: wantsRedirect } = getQuery(event)
        if (!videoUrl) throw createError({ statusCode: 400, statusMessage: 'Missing parameters' })
        const cookie = cookieRaw == null ? '' : String(cookieRaw)
        const clientAbort = bindClientAbort(event)

        if (wantsRedirect === 'true') return await handleRedirect(event, videoUrl, cookie, clientAbort.signal)

        let parsedUrl
        try {
            parsedUrl = new URL(videoUrl)
        } catch {
            throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
        }

        if (isHlsPlaylist(videoUrl)) return await handleM3u8(videoUrl, cookie, clientAbort.signal, event)
        if (isHlsSegment(videoUrl, parsedUrl.pathname)) {
            return await handleSegment(videoUrl, cookie, clientAbort.signal, event)
        }
        return await handleProgressive(videoUrl, cookie, clientAbort.signal, event)
    } catch (err) {
        // Client seek / skip / tab close cancels in-flight HLS segments — not a server fault.
        if (isAbortError(err)) return
        if (err?.statusCode && err.statusCode < 500) throw err
        if (err?.data?.errorId) throw err
        throw createLoggedError(event, {
            statusCode: err?.statusCode || 502,
            statusMessage: err?.statusMessage || 'Video proxy error',
            err,
            context: { module: 'proxy-video' },
        })
    }
})

async function handleProgressive(videoUrl, cookie, signal, event) {
    const cacheKey = cookie ? `${videoUrl}\0${cookie}` : videoUrl
    let headInfo = metadataCache.get(cacheKey)

    if (!headInfo || Date.now() - headInfo.timestamp > METADATA_CACHE_TTL) {
        headInfo = await getVideoInfo(videoUrl, cookie, signal)
        if (headInfo.success) cacheHeadInfo(cacheKey, headInfo)
    }

    if (!headInfo.success) {
        throw createLoggedError(event, {
            statusCode: headInfo.statusCode || 502,
            statusMessage: headInfo.error || 'Video metadata failed',
            context: { module: 'proxy-video', stage: 'head' },
        })
    }

    const { contentLength: totalSize, acceptsRanges: supportsRange, directUrl, contentType } = headInfo

    // Small file → browser fetches CDN directly (saves proxy CPU/RAM).
    if (totalSize < SMALL_FILE_REDIRECT && directUrl) {
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
    setHeaders(event, { ...IMMUTABLE_CACHE, ...CORS_HEADERS })
    if (statusCode === 206) {
        setResponseHeader(event, 'Content-Range', `bytes ${start}-${end}/${totalSize}`)
        setResponseHeader(event, 'Content-Length', String(chunkSize))
    }

    return sendStream(event, resilientRangeStream(videoUrl, cookie, start, end, signal))
}

/** One read per pull() so backpressure works (critical on low-RAM hosts). */
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
                    range: `bytes=${cursor}-${end}`,
                    accept: 'video/*',
                })
                if (!res.ok && res.status !== 206) {
                    throw createError({ statusCode: res.status, statusMessage: 'Video stream error' })
                }
                if (!res.body) throw new Error('Empty upstream body')
                reader = res.body.getReader()
                attempt = 0
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
            if (signal.aborted || delivered >= total) return controller.close()
            try {
                const r = await ensureReader()
                if (!r) return controller.close()

                const { done, value } = await r.read()
                if (done) {
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

async function handleM3u8(playlistUrl, cookie, signal, event) {
    const res = await fetchWithRetry(playlistUrl, { cookie, signal, accept: '*/*' })
    if (!res.ok) {
        throw createLoggedError(event, {
            statusCode: 502,
            statusMessage: 'Failed to fetch m3u8',
            context: { module: 'proxy-video', stage: 'm3u8', status: res.status },
        })
    }

    const body = await res.text()
    const baseUrl = new URL(playlistUrl)
    const proxyBase = `${getRequestURL(event).origin}/api/proxy-video`
    const qCookie = cookie ? `&cookie=${encodeURIComponent(cookie)}` : ''

    const out = body.split(/\r?\n/).map((line) => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return line
        try {
            const abs = new URL(t, baseUrl).toString()
            return `${proxyBase}?url=${encodeURIComponent(abs)}${qCookie}`
        } catch {
            return line
        }
    })

    setResponseHeader(event, 'Content-Type', 'application/vnd.apple.mpegurl')
    setResponseHeader(event, 'Cache-Control', 'public, max-age=30, stale-while-revalidate=30')
    setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
    return out.join('\n')
}

async function handleSegment(segmentUrl, cookie, signal, event) {
    const res = await fetchWithRetry(segmentUrl, { cookie, signal, accept: '*/*' })
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

async function handleRedirect(event, videoUrl, cookie, signal) {
    try {
        const res = await fetchWithRetry(videoUrl, { cookie, signal, method: 'HEAD', accept: 'video/*' })
        if (!res.ok) {
            throw createLoggedError(event, {
                statusCode: 502,
                statusMessage: 'Could not resolve video URL',
                context: { module: 'proxy-video', stage: 'redirect', status: res.status },
            })
        }
        return {
            success: true,
            url: res.url || videoUrl,
            message: 'Use this URL to stream directly and save bandwidth',
        }
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

async function getVideoInfo(videoUrl, cookie, signal) {
    try {
        const res = await fetchWithRetry(videoUrl, {
            cookie,
            signal,
            method: 'HEAD',
            accept: 'video/*',
        })
        if (!res.ok) return { success: false, error: `HEAD request failed: ${res.status}`, statusCode: res.status }

        const contentLength = parseInt(res.headers.get('content-length'), 10)
        if (!contentLength || Number.isNaN(contentLength)) {
            return { success: false, error: 'Content-Length not available', statusCode: 500 }
        }

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
