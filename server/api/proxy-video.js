// server/api/proxy-video.js
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import { URL } from 'node:url'

dns.setDefaultResultOrder('ipv4first')

// Shorter timeouts for serverless environments
const httpAgent = new http.Agent({
    keepAlive: false, // Disable keep-alive in serverless
    timeout: 30000 // 30 second timeout
})

const httpsAgent = new https.Agent({
    keepAlive: false,
    timeout: 30000
})

// Maximum chunk size: 10MB (completes well within Vercel's 60s limit)
const MAX_CHUNK_SIZE = 10 * 1024 * 1024

export default defineEventHandler(async (event) => {
    const { url: videoUrl, cookie } = getQuery(event)

    if (!videoUrl || !cookie) {
        return sendError(
            event,
            createError({ statusCode: 400, statusMessage: 'Missing parameters' })
        )
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

    const rangeHeader = getHeader(event, 'range')

    // CRITICAL: Get video size first to enable proper range requests
    const headInfo = await getVideoInfo(videoUrl, cookie)

    if (!headInfo.success) {
        return sendError(
            event,
            createError({ statusCode: headInfo.statusCode || 502, statusMessage: headInfo.error })
        )
    }

    const totalSize = headInfo.contentLength
    const supportsRange = headInfo.acceptsRanges

    console.log(`Video info: ${totalSize} bytes, Range support: ${supportsRange}`)

    // Parse range request or create one
    let start = 0
    let end = totalSize - 1

    if (rangeHeader && supportsRange) {
        const parts = rangeHeader.replace(/bytes=/, '').split('-')
        start = parseInt(parts[0], 10)
        end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1
    } else if (supportsRange) {
        // Force chunked requests even if client doesn't ask for them
        // This prevents single long-running requests on Vercel
        end = Math.min(start + MAX_CHUNK_SIZE - 1, totalSize - 1)
    }

    // Ensure we don't exceed limits
    const requestedSize = end - start + 1
    if (requestedSize > MAX_CHUNK_SIZE && supportsRange) {
        end = start + MAX_CHUNK_SIZE - 1
        console.log(`Limiting chunk to ${MAX_CHUNK_SIZE} bytes for serverless compatibility`)
    }

    const chunkSize = end - start + 1

    console.log(`Serving range: ${start}-${end}/${totalSize} (${chunkSize} bytes)`)

    // Stream the requested range
    let clientDisconnected = false
    let proxyRequest = null
    let bytesTransferred = 0

    const cleanupRequest = (reason = 'unknown') => {
        if (clientDisconnected) return
        clientDisconnected = true
        console.log(`Cleanup: ${reason}, bytes: ${bytesTransferred}/${chunkSize}`)
        if (proxyRequest && !proxyRequest.destroyed) {
            proxyRequest.destroy()
        }
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
                timeout: 30000, // 30 second timeout for serverless
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'video/webm,video/ogg,video/*;q=0.9,*/*;q=0.5',
                    'Accept-Encoding': 'identity',
                    'Connection': 'close', // Close after request in serverless
                    'Referer': targetUrl.origin,
                    'Range': `bytes=${start}-${end}` // Always use range requests
                }
            }

            console.log(`[Attempt ${attempt}] Requesting bytes ${start}-${end}`)

            proxyRequest = client.request(requestOptions, (res) => {
                if (clientDisconnected) {
                    res.destroy()
                    resolve()
                    return
                }

                console.log(`[Attempt ${attempt}] Status: ${res.statusCode}`)

                // Handle redirects
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

                // Handle errors with retry
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

                // Success - set up streaming
                const statusCode = res.statusCode === 206 ? 206 : 200

                const headers = {
                    'Content-Type': res.headers['content-type'] || 'video/mp4',
                    'Accept-Ranges': 'bytes',
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': 'Range',
                    'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length',
                    'Connection': 'close'
                }

                // Always include Content-Range for partial content
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
                    console.log(`Streaming ${chunkSize} bytes (${start}-${end}/${totalSize})`)
                } catch (err) {
                    console.error('Failed to write headers:', err.message)
                    res.destroy()
                    resolve()
                    return
                }

                // Track data
                res.on('data', (chunk) => {
                    bytesTransferred += chunk.length
                })

                res.on('error', (err) => {
                    if (!clientDisconnected) {
                        const errorCode = err.code || err.name || 'UNKNOWN'
                        if (errorCode !== 'ECONNRESET' && errorCode !== 'ERR_STREAM_PREMATURE_CLOSE') {
                            console.error(`Stream error: ${errorCode} - ${err.message || 'Unknown'}`)
                        }
                    }
                    cleanupRequest('stream error')
                    resolve()
                })

                res.on('end', () => {
                    console.log(`Chunk complete: ${bytesTransferred}/${chunkSize} bytes`)
                    cleanupRequest('stream end')
                    resolve()
                })

                // Pipe with backpressure handling
                res.pipe(event.node.res, { end: true })
            })

            // Timeout for serverless - must complete quickly
            proxyRequest.setTimeout(30000, () => {
                console.log('Request timeout after 30s')
                proxyRequest.destroy(new Error('Request timeout'))
            })

            proxyRequest.on('error', (err) => {
                if (clientDisconnected) {
                    resolve()
                    return
                }

                const errorCode = err.code || err.name || 'UNKNOWN'
                const errorMessage = err.message || 'Unknown error'
                console.error(`Request error: ${errorCode} - ${errorMessage}`)

                const retryableCodes = ['ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH', 'EPIPE']
                if (retryableCodes.includes(errorCode) && attempt < 3) {
                    console.log(`Retrying attempt ${attempt + 1} after ${errorCode}`)
                    setTimeout(() => {
                        makeRequest(currentUrl, attempt + 1).then(resolve).catch(reject)
                    }, 1000 * attempt)
                } else {
                    cleanupRequest('request error')
                    reject(createError({ statusCode: 502, statusMessage: `Proxy error: ${errorMessage}` }))
                }
            })

            proxyRequest.end()
        })

    try {
        await makeRequest(videoUrl)
    } catch (error) {
        if (!clientDisconnected && !event.node.res.headersSent) {
            console.error('Proxy error:', error.message)
            return sendError(event, error)
        }
    } finally {
        cleanupRequest('finally')
    }
})

// Helper function to get video info via HEAD request
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
            // Follow redirects
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

            resolve({
                success: true,
                contentLength,
                acceptsRanges,
                contentType: res.headers['content-type']
            })
        })

        req.setTimeout(10000, () => {
            req.destroy()
            resolve({ success: false, error: 'HEAD request timeout', statusCode: 504 })
        })

        req.on('error', (err) => {
            const errorCode = err.code || err.name || 'UNKNOWN'
            const errorMessage = err.message || 'Unknown error'
            console.error(`HEAD request error: ${errorCode} - ${errorMessage}`)
            resolve({ success: false, error: errorMessage, statusCode: 502 })
        })

        req.end()
    })
}