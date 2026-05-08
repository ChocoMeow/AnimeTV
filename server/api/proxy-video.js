// server/api/proxy-video.js
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import { URL } from 'node:url'

dns.setDefaultResultOrder('ipv4first')

// ─── Connection Pools ──────────────────────────────────────────────────────────
// keepAlive: true  →  reuse TCP connections instead of a full handshake per request
// This alone cuts seek latency significantly on repeated fetches to the same host
const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 60_000,
    maxSockets: 64,
    maxFreeSockets: 16,
    timeout: 30_000,
    scheduling: 'fifo',
})

const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 60_000,
    maxSockets: 64,
    maxFreeSockets: 16,
    timeout: 30_000,
    scheduling: 'fifo',
})

// ─── Chunk / Cache Config ──────────────────────────────────────────────────────
// 4 MB chunks:  browser fires far fewer requests per seek; each request still
// finishes quickly enough that the player doesn't stall.
const DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024 // 4 MB  (was 512 KB)
// When the browser sends an explicit Range we honour up to this cap so a single
// "preload the rest" request doesn't monopolise the connection.
const MAX_PASSTHROUGH_SIZE = 8 * 1024 * 1024 // 8 MB
// Larger metadata cache – 500 entries, 10-minute TTL
const METADATA_CACHE_MAX = 500
const METADATA_CACHE_TTL = 600_000 // 10 min  (was 5 min)

const metadataCache = new Map()

// ─── Shared Cache Headers ──────────────────────────────────────────────────────
const IMMUTABLE_CACHE = {
    'Cache-Control': 'public, max-age=31536000, immutable',
    'CDN-Cache-Control': 'public, max-age=31536000',
    'Vercel-CDN-Cache-Control': 'public, max-age=31536000',
}

// ─── Main Handler ──────────────────────────────────────────────────────────────
export default defineEventHandler(async (event) => {
    const { url: videoUrl, cookie, redirect } = getQuery(event)

    if (!videoUrl || !cookie) {
        return sendError(event, createError({ statusCode: 400, statusMessage: 'Missing parameters' }))
    }

    if (redirect === 'true') {
        return handleRedirect(videoUrl, cookie, event)
    }

    let parsedUrl
    try {
        parsedUrl = new URL(videoUrl)
    } catch {
        return sendError(event, createError({ statusCode: 400, statusMessage: 'Invalid URL' }))
    }

    // ── Route by content type ────────────────────────────────────────────────
    if (/\.m3u8(\?|$)/i.test(videoUrl) || videoUrl.toLowerCase().includes('m3u8')) return handleM3u8(videoUrl, cookie, event)

    if (/\.ts(\?|$)/i.test(parsedUrl.pathname) || videoUrl.toLowerCase().includes('.ts')) return handleSegment(videoUrl, cookie, event)

    // ── Metadata (cached HEAD) ───────────────────────────────────────────────
    const cacheKey = `${videoUrl}:${cookie}`
    let headInfo = metadataCache.get(cacheKey)

    if (!headInfo || Date.now() - headInfo.timestamp > METADATA_CACHE_TTL) {
        headInfo = await getVideoInfo(videoUrl, cookie)
        if (headInfo.success) {
            headInfo.timestamp = Date.now()
            metadataCache.set(cacheKey, headInfo)
            // Evict oldest when cache is full
            if (metadataCache.size > METADATA_CACHE_MAX) {
                metadataCache.delete(metadataCache.keys().next().value)
            }
        }
    }

    if (!headInfo.success) {
        return sendError(
            event,
            createError({
                statusCode: headInfo.statusCode || 502,
                statusMessage: headInfo.error,
            }),
        )
    }

    const { contentLength: totalSize, acceptsRanges: supportsRange } = headInfo

    // ── Small file: redirect directly to save bandwidth ─────────────────────
    // Raised threshold to 10 MB (was 5 MB) so more files skip the proxy entirely
    if (totalSize < 10 * 1024 * 1024 && headInfo.directUrl) {
        setResponseStatus(event, 302)
        setResponseHeader(event, 'Location', headInfo.directUrl)
        return
    }

    // ── Compute byte range ───────────────────────────────────────────────────
    const rangeHeader = getHeader(event, 'range')
    let start = 0
    let end = totalSize - 1

    if (rangeHeader && supportsRange) {
        const [s, e] = rangeHeader.replace(/bytes=/, '').split('-')
        start = parseInt(s, 10)
        // If browser sent an open-ended range (bytes=X-) cap at MAX_PASSTHROUGH_SIZE
        // so we don't stream the whole remainder in one shot.
        end = e ? parseInt(e, 10) : Math.min(start + MAX_PASSTHROUGH_SIZE - 1, totalSize - 1)
    } else if (supportsRange) {
        // No range header → send a good-sized initial chunk so playback starts fast
        end = Math.min(start + DEFAULT_CHUNK_SIZE - 1, totalSize - 1)
    }

    // Hard cap: never exceed MAX_PASSTHROUGH_SIZE per response
    if (supportsRange && end - start + 1 > MAX_PASSTHROUGH_SIZE) {
        end = start + MAX_PASSTHROUGH_SIZE - 1
    }

    const chunkSize = end - start + 1

    // ── Lifecycle tracking ───────────────────────────────────────────────────
    let clientDisconnected = false
    let proxyRequest = null

    const cleanup = () => {
        if (clientDisconnected) return
        clientDisconnected = true
        if (proxyRequest && !proxyRequest.destroyed) proxyRequest.destroy()
    }

    event.node.req.on('close', cleanup)
    event.node.req.on('error', cleanup)

    // ── Proxy with redirect + retry logic ────────────────────────────────────
    const makeRequest = (currentUrl, attempt = 1) =>
        new Promise((resolve, reject) => {
            if (clientDisconnected) return resolve()

            let targetUrl
            try {
                targetUrl = new URL(currentUrl)
            } catch {
                return reject(createError({ statusCode: 400, statusMessage: 'Invalid URL' }))
            }

            const isHttps = targetUrl.protocol === 'https:'
            const client = isHttps ? https : http
            const agent = isHttps ? httpsAgent : httpAgent

            const reqOptions = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (isHttps ? 443 : 80),
                path: targetUrl.pathname + targetUrl.search,
                method: 'GET',
                agent,
                timeout: 30_000,
                headers: {
                    Cookie: cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Accept: 'video/webm,video/ogg,video/*;q=0.9,*/*;q=0.5',
                    'Accept-Encoding': 'identity',
                    Connection: 'keep-alive', // reuse the pooled socket
                    Referer: targetUrl.origin,
                    Range: `bytes=${start}-${end}`,
                },
            }

            proxyRequest = client.request(reqOptions, (res) => {
                if (clientDisconnected) {
                    res.destroy()
                    return resolve()
                }

                // ── Redirects ────────────────────────────────────────────────
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.destroy()
                    if (attempt >= 5) return reject(createError({ statusCode: 508, statusMessage: 'Too many redirects' }))
                    const nextUrl = new URL(res.headers.location, currentUrl).toString()
                    return setTimeout(
                        () =>
                            makeRequest(nextUrl, attempt + 1)
                                .then(resolve)
                                .catch(reject),
                        100,
                    )
                }

                // ── Server errors with retry ─────────────────────────────────
                if (res.statusCode >= 400) {
                    res.destroy()
                    if ((res.statusCode >= 500 || res.statusCode === 408) && attempt < 3) {
                        return setTimeout(
                            () =>
                                makeRequest(currentUrl, attempt + 1)
                                    .then(resolve)
                                    .catch(reject),
                            800 * attempt,
                        )
                    }
                    return reject(createError({ statusCode: res.statusCode, statusMessage: 'Video stream error' }))
                }

                // ── Build response headers ───────────────────────────────────
                const statusCode = res.statusCode === 206 ? 206 : 200
                const headers = {
                    'Content-Type': res.headers['content-type'] || 'video/mp4',
                    'Accept-Ranges': 'bytes',
                    ...IMMUTABLE_CACHE,
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': 'Range',
                    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
                    // Tell CDNs / clients to vary on Range so different byte windows are
                    // cached independently – critical for seek performance
                    Vary: 'Range',
                    Connection: 'keep-alive',
                }

                if (statusCode === 206) {
                    headers['Content-Range'] = `bytes ${start}-${end}/${totalSize}`
                    headers['Content-Length'] = String(chunkSize)
                } else if (res.headers['content-length']) {
                    headers['Content-Length'] = res.headers['content-length']
                }

                if (res.headers['last-modified']) headers['Last-Modified'] = res.headers['last-modified']
                if (res.headers['etag']) headers['ETag'] = res.headers['etag']

                if (event.node.res.headersSent) {
                    res.destroy()
                    return resolve()
                }

                try {
                    event.node.res.writeHead(statusCode, headers)
                } catch {
                    res.destroy()
                    return resolve()
                }

                res.on('error', () => {
                    cleanup()
                    resolve()
                })
                res.on('end', () => {
                    cleanup()
                    resolve()
                })
                res.pipe(event.node.res, { end: true })
            })

            proxyRequest.setTimeout(30_000, () => proxyRequest.destroy(new Error('Request timeout')))

            proxyRequest.on('error', (err) => {
                if (clientDisconnected) return resolve()
                const code = err.code || err.name || 'UNKNOWN'
                const retryable = ['ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE', 'ECONNABORTED']
                if (retryable.includes(code) && attempt < 3) {
                    return setTimeout(
                        () =>
                            makeRequest(currentUrl, attempt + 1)
                                .then(resolve)
                                .catch(reject),
                        800 * attempt,
                    )
                }
                cleanup()
                reject(createError({ statusCode: 502, statusMessage: err.message || 'Proxy error' }))
            })

            proxyRequest.end()
        })

    try {
        await makeRequest(videoUrl)
    } catch (error) {
        if (!clientDisconnected && !event.node.res.headersSent) return sendError(event, error)
    } finally {
        cleanup()
    }
})

// ─── HLS / M3U8 ───────────────────────────────────────────────────────────────
async function handleM3u8(playlistUrl, cookie, event) {
    const body = await fetchUrl(playlistUrl, cookie)
    if (body == null) return sendError(event, createError({ statusCode: 502, statusMessage: 'Failed to fetch m3u8' }))

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
    // Short TTL for playlists – segments themselves are immutable
    setResponseHeader(event, 'Cache-Control', 'public, max-age=30, stale-while-revalidate=30')
    setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
    return out.join('\n')
}

// ─── HLS Segment (.ts) ────────────────────────────────────────────────────────
async function handleSegment(segmentUrl, cookie, event) {
    const fail = (code, msg) => !event.node.res.headersSent && sendError(event, createError({ statusCode: code, statusMessage: msg }))

    let targetUrl
    try {
        targetUrl = new URL(segmentUrl)
    } catch {
        return fail(400, 'Invalid segment URL')
    }

    const isHttps = targetUrl.protocol === 'https:'
    const client = isHttps ? https : http
    const agent = isHttps ? httpsAgent : httpAgent
    const referer = targetUrl.hostname.includes('anime1.me') ? 'https://anime1.me/' : targetUrl.origin + '/'

    const opts = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (isHttps ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: 'GET',
        agent,
        timeout: 30_000,
        headers: {
            Cookie: cookie,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Accept: '*/*',
            Connection: 'keep-alive',
            Referer: referer,
        },
    }

    return new Promise((resolve) => {
        const req = client.request(opts, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.destroy()
                const next = new URL(res.headers.location, segmentUrl).toString()
                return handleSegment(next, cookie, event)
                    .then(resolve)
                    .catch(() => resolve())
            }
            if (res.statusCode !== 200 && res.statusCode !== 206) {
                res.destroy()
                return resolve(fail(res.statusCode, res.statusMessage || 'Segment failed'))
            }
            if (event.node.res.headersSent) {
                res.destroy()
                return resolve()
            }

            setResponseStatus(event, res.statusCode)
            setResponseHeader(event, 'Content-Type', res.headers['content-type'] || 'video/mp2t')
            setResponseHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
            setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
            if (res.headers['content-length']) setResponseHeader(event, 'Content-Length', res.headers['content-length'])
            if (res.statusCode === 206 && res.headers['content-range']) setResponseHeader(event, 'Content-Range', res.headers['content-range'])

            res.pipe(event.node.res, { end: true })
            res.on('end', () => resolve())
            res.on('error', () => resolve(fail(502, 'Segment stream error')))
        })

        req.setTimeout(30_000, () => {
            req.destroy()
            resolve(fail(504, 'Segment timeout'))
        })
        req.on('error', (e) => resolve(fail(502, e.message || 'Segment error')))
        req.end()
    })
}

// ─── Generic URL fetch (text, for m3u8 bodies) ────────────────────────────────
function fetchUrl(url, cookie, attempt = 1) {
    return new Promise((resolve) => {
        let targetUrl
        try {
            targetUrl = new URL(url)
        } catch {
            return resolve(null)
        }

        const isHttps = targetUrl.protocol === 'https:'
        const client = isHttps ? https : http
        const agent = isHttps ? httpsAgent : httpAgent

        const opts = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (isHttps ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            method: 'GET',
            agent,
            timeout: 15_000,
            headers: {
                Cookie: cookie,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Accept: '*/*',
                Connection: 'keep-alive',
                Referer: targetUrl.origin,
            },
        }

        const req = client.request(opts, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return fetchUrl(new URL(res.headers.location, url).toString(), cookie).then(resolve)
            }
            if (res.statusCode !== 200) return resolve(null)

            const chunks = []
            res.on('data', (c) => chunks.push(c))
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
            res.on('error', () => {
                if (attempt < 3) return fetchUrl(url, cookie, attempt + 1).then(resolve)
                resolve(null)
            })
        })

        req.setTimeout(15_000, () => {
            req.destroy()
            resolve(null)
        })
        req.on('error', () => {
            if (attempt < 3) return setTimeout(() => fetchUrl(url, cookie, attempt + 1).then(resolve), 500 * attempt)
            resolve(null)
        })
        req.end()
    })
}

// ─── Redirect resolver ────────────────────────────────────────────────────────
async function handleRedirect(videoUrl, cookie, event) {
    try {
        const finalUrl = await getFinalUrl(videoUrl, cookie)
        if (!finalUrl) return sendError(event, createError({ statusCode: 502, statusMessage: 'Could not resolve video URL' }))
        return { success: true, url: finalUrl, message: 'Use this URL to stream directly and save bandwidth' }
    } catch (error) {
        return sendError(event, error)
    }
}

async function getFinalUrl(videoUrl, cookie, maxRedirects = 5) {
    return new Promise((resolve) => {
        let redirectCount = 0

        const follow = (url) => {
            if (redirectCount >= maxRedirects) return resolve(null)
            let targetUrl
            try {
                targetUrl = new URL(url)
            } catch {
                return resolve(null)
            }

            const isHttps = targetUrl.protocol === 'https:'
            const client = isHttps ? https : http
            const agent = isHttps ? httpsAgent : httpAgent

            const opts = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (isHttps ? 443 : 80),
                path: targetUrl.pathname + targetUrl.search,
                method: 'HEAD',
                agent,
                timeout: 10_000,
                headers: {
                    Cookie: cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    Accept: 'video/*',
                    Connection: 'keep-alive',
                },
            }

            const req = client.request(opts, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    redirectCount++
                    return follow(new URL(res.headers.location, url).toString())
                }
                resolve(res.statusCode === 200 ? url : null)
            })

            req.setTimeout(10_000, () => {
                req.destroy()
                resolve(null)
            })
            req.on('error', () => resolve(null))
            req.end()
        }

        follow(videoUrl)
    })
}

// ─── Video metadata via HEAD ──────────────────────────────────────────────────
async function getVideoInfo(videoUrl, cookie) {
    return new Promise((resolve) => {
        let targetUrl
        try {
            targetUrl = new URL(videoUrl)
        } catch {
            return resolve({ success: false, error: 'Invalid URL', statusCode: 400 })
        }

        const isHttps = targetUrl.protocol === 'https:'
        const client = isHttps ? https : http
        const agent = isHttps ? httpsAgent : httpAgent

        const opts = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (isHttps ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            method: 'HEAD',
            agent,
            timeout: 10_000,
            headers: {
                Cookie: cookie,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Accept: 'video/*',
                Connection: 'keep-alive',
            },
        }

        const req = client.request(opts, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const next = new URL(res.headers.location, videoUrl).toString()
                return getVideoInfo(next, cookie).then(resolve)
            }
            if (res.statusCode !== 200) {
                return resolve({ success: false, error: `HEAD request failed: ${res.statusCode}`, statusCode: res.statusCode })
            }

            const contentLength = parseInt(res.headers['content-length'], 10)
            if (!contentLength || isNaN(contentLength)) {
                return resolve({ success: false, error: 'Content-Length not available', statusCode: 500 })
            }

            resolve({
                success: true,
                contentLength,
                acceptsRanges: res.headers['accept-ranges'] === 'bytes',
                contentType: res.headers['content-type'],
                directUrl: videoUrl,
            })
        })

        req.setTimeout(10_000, () => {
            req.destroy()
            resolve({ success: false, error: 'HEAD request timeout', statusCode: 504 })
        })

        req.on('error', (err) => resolve({ success: false, error: err.message || 'Unknown', statusCode: 502 }))

        req.end()
    })
}
