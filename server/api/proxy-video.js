// server/api/proxy-video.js
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import { URL } from 'node:url'

dns.setDefaultResultOrder('ipv4first')

const httpAgent = new http.Agent({
    keepAlive: false,
    timeout: 30000
})

const httpsAgent = new https.Agent({
    keepAlive: false,
    timeout: 30000
})

const MAX_CHUNK_SIZE = 512 * 1024
const metadataCache = new Map()
const METADATA_CACHE_TTL = 300000

export default defineEventHandler(async (event) => {
    const { url: videoUrl, cookie, redirect } = getQuery(event)

    if (!videoUrl || !cookie) {
        return sendError(
            event,
            createError({ statusCode: 400, statusMessage: 'Missing parameters' })
        )
    }

    if (redirect === 'true') {
        return await handleRedirect(videoUrl, cookie, event)
    }

    let parsedUrl
    try {
        parsedUrl = new URL(videoUrl)
    } catch (err) {
        return sendError(
            event,
            createError({ statusCode: 400, statusMessage: 'Invalid URL' })
        )
    }

    if (/\.m3u8(\?|$)/i.test(videoUrl) || videoUrl.toLowerCase().includes('m3u8')) return await handleM3u8(videoUrl, cookie, event)
    if (/\.ts(\?|$)/i.test(parsedUrl.pathname) || videoUrl.toLowerCase().includes('.ts')) return await handleSegment(videoUrl, cookie, event)

    const rangeHeader = getHeader(event, 'range')

    const cacheKey = `${videoUrl}:${cookie}`
    let headInfo = metadataCache.get(cacheKey)
    if (!headInfo || Date.now() - headInfo.timestamp > METADATA_CACHE_TTL) {
        headInfo = await getVideoInfo(videoUrl, cookie)
        if (headInfo.success) {
            headInfo.timestamp = Date.now()
            metadataCache.set(cacheKey, headInfo)
            if (metadataCache.size > 100) metadataCache.delete(metadataCache.keys().next().value)
        }
    }

    if (!headInfo.success) {
        return sendError(
            event,
            createError({ statusCode: headInfo.statusCode || 502, statusMessage: headInfo.error })
        )
    }

    const totalSize = headInfo.contentLength
    const supportsRange = headInfo.acceptsRanges

    if (totalSize < 5 * 1024 * 1024 && headInfo.directUrl) {
        setResponseStatus(event, 302)
        setResponseHeader(event, 'Location', headInfo.directUrl)
        return
    }

    let start = 0
    let end = totalSize - 1
    if (rangeHeader && supportsRange) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-')
        start = parseInt(parts[0], 10)
        end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1
    } else if (supportsRange) {
        end = Math.min(start + MAX_CHUNK_SIZE - 1, totalSize - 1)
    }
    if (end - start + 1 > MAX_CHUNK_SIZE && supportsRange) end = start + MAX_CHUNK_SIZE - 1
    const chunkSize = end - start + 1
    const cacheHeaders = { 'Cache-Control': 'public, max-age=31536000, immutable', 'CDN-Cache-Control': 'public, max-age=31536000', 'Vercel-CDN-Cache-Control': 'public, max-age=31536000' }

    let clientDisconnected = false
    let proxyRequest = null
    let bytesTransferred = 0

    const cleanupRequest = (reason = 'unknown') => {
        if (clientDisconnected) return
        clientDisconnected = true
        if (proxyRequest && !proxyRequest.destroyed) proxyRequest.destroy()
    }

    event.node.req.on('close', () => cleanupRequest('client close'))
    event.node.req.on('error', () => cleanupRequest('client error'))

    const makeRequest = (currentUrl, attempt = 1) =>
        new Promise((resolve, reject) => {
            if (clientDisconnected) {
                resolve()
                return
            }

            let targetUrl
            try {
                targetUrl = new URL(currentUrl)
            } catch (err) {
                reject(createError({ statusCode: 400, statusMessage: 'Invalid URL' }))
                return
            }

            const client = targetUrl.protocol === 'https:' ? https : http
            const agent = targetUrl.protocol === 'https:' ? httpsAgent : httpAgent

            const requestOptions = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetUrl.pathname + targetUrl.search,
                method: 'GET',
                agent,
                timeout: 30000,
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'video/webm,video/ogg,video/*;q=0.9,*/*;q=0.5',
                    'Accept-Encoding': 'identity',
                    'Connection': 'close',
                    'Referer': targetUrl.origin,
                    'Range': `bytes=${start}-${end}`
                }
            }

            proxyRequest = client.request(requestOptions, (res) => {
                if (clientDisconnected) {
                    res.destroy()
                    resolve()
                    return
                }
                // Redirects
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.destroy()
                    if (attempt >= 5) {
                        reject(createError({ statusCode: 508, statusMessage: 'Too many redirects' }))
                        return
                    }
                    const redirectUrl = new URL(res.headers.location, currentUrl).toString()
                    setTimeout(() => {
                        makeRequest(redirectUrl, attempt + 1).then(resolve).catch(reject)
                    }, 100)
                    return
                }
                if (res.statusCode >= 400) {
                    res.destroy()
                    if ((res.statusCode >= 500 || res.statusCode === 408) && attempt < 3) {
                        setTimeout(() => {
                            makeRequest(currentUrl, attempt + 1).then(resolve).catch(reject)
                        }, 1000 * attempt)
                        return
                    }
                    reject(createError({ statusCode: res.statusCode, statusMessage: 'Video stream error' }))
                    return
                }

                const statusCode = res.statusCode === 206 ? 206 : 200

                const headers = {
                    'Content-Type': res.headers['content-type'] || 'video/mp4',
                    'Accept-Ranges': 'bytes',
                    ...cacheHeaders,
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': 'Range',
                    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
                    'Connection': 'close'
                }

                if (statusCode === 206) {
                    headers['Content-Range'] = `bytes ${start}-${end}/${totalSize}`
                    headers['Content-Length'] = chunkSize.toString()
                } else if (res.headers['content-length']) {
                    headers['Content-Length'] = res.headers['content-length']
                }

                if (res.headers['last-modified']) {
                    headers['Last-Modified'] = res.headers['last-modified']
                }
                if (res.headers['etag']) {
                    headers['ETag'] = res.headers['etag']
                }

                if (event.node.res.headersSent) {
                    res.destroy()
                    resolve()
                    return
                }

                try {
                    event.node.res.writeHead(statusCode, headers)
                } catch (err) {
                    res.destroy()
                    resolve()
                    return
                }

                res.on('data', (chunk) => {
                    bytesTransferred += chunk.length
                })

                res.on('error', () => { cleanupRequest('stream error'); resolve() })
                res.on('end', () => { cleanupRequest('stream end'); resolve() })

                res.pipe(event.node.res, { end: true })
            })

            proxyRequest.setTimeout(30000, () => proxyRequest.destroy(new Error('Request timeout')))
            proxyRequest.on('error', (err) => {
                if (clientDisconnected) { resolve(); return }
                const code = err.code || err.name || 'UNKNOWN'
                const retryable = ['ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE']
                if (retryable.includes(code) && attempt < 3) {
                    setTimeout(() => makeRequest(currentUrl, attempt + 1).then(resolve).catch(reject), 1000 * attempt)
                } else {
                    cleanupRequest('request error')
                    reject(createError({ statusCode: 502, statusMessage: err.message || 'Proxy error' }))
                }
            })

            proxyRequest.end()
        })

    try {
        await makeRequest(videoUrl)
    } catch (error) {
        if (!clientDisconnected && !event.node.res.headersSent) return sendError(event, error)
    } finally {
        cleanupRequest('finally')
    }
})

async function handleM3u8(playlistUrl, cookie, event) {
    const body = await fetchUrl(playlistUrl, cookie)
    if (body == null) return sendError(event, createError({ statusCode: 502, statusMessage: 'Failed to fetch m3u8' }))
    const baseUrl = new URL(playlistUrl)
    const proxyBase = getRequestURL(event).origin + '/api/proxy-video'
    const out = body.split(/\r?\n/).map((line) => {
        const t = line.trim()
        if (!t || t.startsWith('#')) return line
        try {
            return `${proxyBase}?url=${encodeURIComponent(new URL(t, baseUrl).toString())}&cookie=${encodeURIComponent(cookie)}`
        } catch {
            return line
        }
    })
    setResponseHeader(event, 'Content-Type', 'application/vnd.apple.mpegurl')
    setResponseHeader(event, 'Cache-Control', 'public, max-age=60')
    setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
    return out.join('\n')
}

async function handleSegment(segmentUrl, cookie, event) {
    const fail = (code, msg) => !event.node.res.headersSent && sendError(event, createError({ statusCode: code, statusMessage: msg }))
    let targetUrl
    try {
        targetUrl = new URL(segmentUrl)
    } catch {
        return fail(400, 'Invalid segment URL')
    }
    const client = targetUrl.protocol === 'https:' ? https : http
    const agent = targetUrl.protocol === 'https:' ? httpsAgent : httpAgent
    const referer = targetUrl.hostname.includes('anime1.me') ? 'https://anime1.me/' : targetUrl.origin + '/'
    const opts = {
        hostname: targetUrl.hostname,
        port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
        path: targetUrl.pathname + targetUrl.search,
        method: 'GET',
        agent,
        timeout: 30000,
        headers: { 'Cookie': cookie, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': '*/*', 'Connection': 'close', 'Referer': referer }
    }
    return new Promise((resolve) => {
        const req = client.request(opts, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.destroy()
                return handleSegment(new URL(res.headers.location, segmentUrl).toString(), cookie, event).then(resolve).catch(() => resolve())
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
        })
        req.setTimeout(30000, () => { req.destroy(); resolve(fail(504, 'Segment timeout')) })
        req.on('error', (e) => { resolve(fail(502, e.message || 'Segment error')) })
        req.end()
    })
}

function fetchUrl(url, cookie) {
    return new Promise((resolve) => {
        let targetUrl
        try {
            targetUrl = new URL(url)
        } catch (err) {
            resolve(null)
            return
        }
        const client = targetUrl.protocol === 'https:' ? https : http
        const agent = targetUrl.protocol === 'https:' ? httpsAgent : httpAgent
        const opts = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            method: 'GET',
            agent,
            timeout: 15000,
            headers: {
                'Cookie': cookie,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': '*/*',
                'Connection': 'close',
                'Referer': targetUrl.origin
            }
        }
        const req = client.request(opts, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const next = new URL(res.headers.location, url).toString()
                fetchUrl(next, cookie).then(resolve)
                return
            }
            if (res.statusCode !== 200) {
                resolve(null)
                return
            }
            const chunks = []
            res.on('data', (chunk) => chunks.push(chunk))
            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
            res.on('error', () => resolve(null))
        })
        req.setTimeout(15000, () => {
            req.destroy()
            resolve(null)
        })
        req.on('error', () => resolve(null))
        req.end()
    })
}

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
        let currentUrl = videoUrl
        let redirectCount = 0

        const followRedirect = (url) => {
            if (redirectCount >= maxRedirects) {
                resolve(null)
                return
            }

            let targetUrl
            try {
                targetUrl = new URL(url)
            } catch (err) {
                resolve(null)
                return
            }

            const client = targetUrl.protocol === 'https:' ? https : http
            const agent = targetUrl.protocol === 'https:' ? httpsAgent : httpAgent

            const requestOptions = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetUrl.pathname + targetUrl.search,
                method: 'HEAD',
                agent,
                timeout: 10000,
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'video/*',
                    'Connection': 'close'
                }
            }

            const req = client.request(requestOptions, (res) => {
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    redirectCount++
                    const nextUrl = new URL(res.headers.location, url).toString()
                    followRedirect(nextUrl)
                } else if (res.statusCode === 200) {
                    resolve(url)
                } else {
                    resolve(null)
                }
            })

            req.setTimeout(10000, () => {
                req.destroy()
                resolve(null)
            })

            req.on('error', () => {
                resolve(null)
            })

            req.end()
        }

        followRedirect(currentUrl)
    })
}

async function getVideoInfo(videoUrl, cookie) {
    return new Promise((resolve) => {
        let targetUrl
        try {
            targetUrl = new URL(videoUrl)
        } catch (err) {
            resolve({ success: false, error: 'Invalid URL', statusCode: 400 })
            return
        }

        const client = targetUrl.protocol === 'https:' ? https : http
        const agent = targetUrl.protocol === 'https:' ? httpsAgent : httpAgent

        const requestOptions = {
            hostname: targetUrl.hostname,
            port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
            path: targetUrl.pathname + targetUrl.search,
            method: 'HEAD',
            agent,
            timeout: 10000,
            headers: {
                'Cookie': cookie,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'video/*',
                'Connection': 'close'
            }
        }

        const req = client.request(requestOptions, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                const redirectUrl = new URL(res.headers.location, videoUrl).toString()
                getVideoInfo(redirectUrl, cookie).then(resolve)
                return
            }

            if (res.statusCode !== 200) {
                resolve({ success: false, error: `HEAD request failed: ${res.statusCode}`, statusCode: res.statusCode })
                return
            }

            const contentLength = parseInt(res.headers['content-length'], 10)
            const acceptsRanges = res.headers['accept-ranges'] === 'bytes'

            if (!contentLength || isNaN(contentLength)) {
                resolve({ success: false, error: 'Content-Length not available', statusCode: 500 })
                return
            }

            resolve({ success: true, contentLength, acceptsRanges, contentType: res.headers['content-type'], directUrl: videoUrl })
        })

        req.setTimeout(10000, () => {
            req.destroy()
            resolve({ success: false, error: 'HEAD request timeout', statusCode: 504 })
        })

        req.on('error', (err) => resolve({ success: false, error: err.message || 'Unknown', statusCode: 502 }))

        req.end()
    })
}