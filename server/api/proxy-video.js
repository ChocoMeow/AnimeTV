// server/api/proxy-video.js
import http from 'node:http'
import https from 'node:https'
import dns from 'node:dns'
import { URL } from 'node:url'

// Force IPv4 first to avoid ETIMEDOUT from IPv6 issues
dns.setDefaultResultOrder('ipv4first')

// Configure agents with streaming-optimized settings
const httpAgent = new http.Agent({
    keepAlive: true,
    keepAliveMsecs: 3000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 0 // No timeout for keep-alive
})

const httpsAgent = new https.Agent({
    keepAlive: true,
    keepAliveMsecs: 3000,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 0 // No timeout for keep-alive
})

export default defineEventHandler(async (event) => {
    const { url: videoUrl, cookie } = getQuery(event)

    if (!videoUrl || !cookie) {
        return sendError(
            event,
            createError({ statusCode: 400, statusMessage: 'Missing parameters' })
        )
    }

    // Validate URL
    let parsedUrl
    try {
        parsedUrl = new URL(videoUrl)
    } catch (err) {
        return sendError(
            event,
            createError({ statusCode: 400, statusMessage: 'Invalid URL' })
        )
    }

    const range = getHeader(event, 'range')

    // Track if client disconnected
    let clientDisconnected = false
    let proxyRequest = null
    let lastDataReceived = Date.now()
    let idleCheckInterval = null

    // Handle client disconnection
    const cleanupRequest = () => {
        clientDisconnected = true
        if (idleCheckInterval) {
            clearInterval(idleCheckInterval)
            idleCheckInterval = null
        }
        if (proxyRequest && !proxyRequest.destroyed) {
            proxyRequest.destroy()
        }
    }

    event.node.req.on('close', cleanupRequest)
    event.node.req.on('error', cleanupRequest)
    event.node.res.on('close', cleanupRequest)

    const makeRequest = (currentUrl, attempt = 1) =>
        new Promise((resolve, reject) => {
            // Don't make new requests if client already disconnected
            if (clientDisconnected) {
                resolve()
                return
            }

            let targetUrl
            try {
                targetUrl = new URL(currentUrl)
            } catch (err) {
                reject(createError({ statusCode: 400, statusMessage: 'Invalid redirect URL' }))
                return
            }

            const client = targetUrl.protocol === 'https:' ? https : http
            const agent = targetUrl.protocol === 'https:' ? httpsAgent : httpAgent

            console.log(`[Attempt ${attempt}] Requesting: ${targetUrl.href}${range ? ` (Range: ${range})` : ''}`)

            const requestOptions = {
                hostname: targetUrl.hostname,
                port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
                path: targetUrl.pathname + targetUrl.search,
                method: 'GET',
                agent,
                timeout: 60000, // Initial connection timeout only
                headers: {
                    'Cookie': cookie,
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'video/webm,video/ogg,video/*;q=0.9,application/ogg;q=0.7,audio/*;q=0.6,*/*;q=0.5',
                    'Accept-Language': 'en-US,en;q=0.5',
                    'Accept-Encoding': 'identity',
                    'Connection': 'keep-alive',
                    'Referer': targetUrl.origin,
                    ...(range ? { 'Range': range } : {})
                }
            }

            proxyRequest = client.request(requestOptions, (res) => {
                // Don't process if client disconnected
                if (clientDisconnected) {
                    res.destroy()
                    resolve()
                    return
                }

                console.log(`[Attempt ${attempt}] Response status: ${res.statusCode}`)

                // Handle redirects (301, 302, 307, 308)
                if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                    res.destroy()

                    if (attempt >= 5) {
                        console.error(`[Attempt ${attempt}] Too many redirects`)
                        reject(createError({
                            statusCode: 508,
                            statusMessage: 'Too many redirects'
                        }))
                        return
                    }

                    const redirectUrl = new URL(res.headers.location, currentUrl).toString()
                    console.log(`[Attempt ${attempt}] Redirecting to: ${redirectUrl}`)

                    // Retry with new URL
                    setTimeout(() => {
                        makeRequest(redirectUrl, attempt + 1)
                            .then(resolve)
                            .catch(reject)
                    }, 100)
                    return
                }

                // Handle error responses
                if (res.statusCode >= 400) {
                    res.destroy()

                    // Retry on server errors (500+) or timeout (408)
                    if ((res.statusCode >= 500 || res.statusCode === 408) && attempt < 3) {
                        console.log(`[Attempt ${attempt}] Server error ${res.statusCode}, retrying...`)
                        setTimeout(() => {
                            makeRequest(currentUrl, attempt + 1)
                                .then(resolve)
                                .catch(reject)
                        }, 1000 * attempt)
                        return
                    }

                    console.error(`[Attempt ${attempt}] Failed with status: ${res.statusCode}`)
                    reject(createError({
                        statusCode: res.statusCode,
                        statusMessage: `Video stream error: ${res.statusMessage}`
                    }))
                    return
                }

                // Success! Set up streaming
                const statusCode = range && res.statusCode === 206 ? 206 : 200

                // Pass through headers
                const headers = {
                    'Content-Type': res.headers['content-type'] || 'video/mp4',
                    'Accept-Ranges': res.headers['accept-ranges'] || 'bytes',
                    'Cache-Control': 'public, max-age=3600',
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
                    'Access-Control-Allow-Headers': 'Range'
                }

                if (res.headers['content-length']) {
                    headers['Content-Length'] = res.headers['content-length']
                }
                if (res.headers['content-range']) {
                    headers['Content-Range'] = res.headers['content-range']
                }
                if (res.headers['last-modified']) {
                    headers['Last-Modified'] = res.headers['last-modified']
                }
                if (res.headers['etag']) {
                    headers['ETag'] = res.headers['etag']
                }

                // Don't send headers if client disconnected
                if (clientDisconnected || event.node.res.headersSent) {
                    res.destroy()
                    resolve()
                    return
                }

                try {
                    event.node.res.writeHead(statusCode, headers)
                    console.log(`[Attempt ${attempt}] Streaming started`)
                } catch (err) {
                    res.destroy()
                    resolve()
                    return
                }

                // Reset last data received time
                lastDataReceived = Date.now()

                // Monitor for idle connections (no data for 90 seconds = stalled)
                // This is much longer than browser buffering pauses
                idleCheckInterval = setInterval(() => {
                    const idleTime = Date.now() - lastDataReceived
                    if (idleTime > 90000) { // 90 seconds with no data
                        console.log(`[Attempt ${attempt}] Connection idle for ${Math.floor(idleTime / 1000)}s, closing`)
                        cleanupRequest()
                    }
                }, 10000) // Check every 10 seconds

                // Update last data received on each chunk
                res.on('data', () => {
                    lastDataReceived = Date.now()
                })

                // Handle stream errors
                res.on('error', (err) => {
                    if (err.code !== 'ECONNRESET' && !err.message.includes('aborted')) {
                        console.error(`[Attempt ${attempt}] Stream error:`, err.message)
                    }
                    cleanupRequest()
                    if (!event.node.res.destroyed) {
                        event.node.res.destroy()
                    }
                    resolve()
                })

                res.on('end', () => {
                    console.log(`[Attempt ${attempt}] Stream completed`)
                    cleanupRequest()
                    resolve()
                })

                res.on('close', () => {
                    cleanupRequest()
                    resolve()
                })

                // Pipe with error handling
                try {
                    res.pipe(event.node.res, { end: true })
                } catch (err) {
                    res.destroy()
                    cleanupRequest()
                    resolve()
                }
            })

            // Only timeout on initial connection, not during streaming
            proxyRequest.setTimeout(60000, () => {
                if (!clientDisconnected && !event.node.res.headersSent) {
                    // Only timeout if we haven't started streaming yet
                    console.log(`[Attempt ${attempt}] Initial connection timeout`)
                    proxyRequest.destroy(new Error('Initial connection timed out'))
                }
            })

            proxyRequest.on('error', (err) => {
                // Don't log or retry if client disconnected
                if (clientDisconnected) {
                    resolve()
                    return
                }

                // Don't treat as error if we're already streaming and connection resets
                if (err.code === 'ECONNRESET' && event.node.res.headersSent) {
                    console.log(`[Attempt ${attempt}] Connection reset during streaming (client likely paused/seeked)`)
                    cleanupRequest()
                    resolve()
                    return
                }

                console.error(`[Attempt ${attempt}] Request error:`, err.code, err.message)

                // Retry logic for network issues (only before streaming starts)
                const retryableCodes = ['ETIMEDOUT', 'ENOTFOUND', 'ECONNRESET', 'ECONNREFUSED', 'EHOSTUNREACH']

                if (retryableCodes.includes(err.code) && attempt < 3 && !event.node.res.headersSent) {
                    console.log(`[Attempt ${attempt}] Retrying after error: ${err.code}`)
                    setTimeout(() => {
                        makeRequest(currentUrl, attempt + 1)
                            .then(resolve)
                            .catch(reject)
                    }, 1000 * attempt)
                } else {
                    cleanupRequest()
                    reject(createError({
                        statusCode: 502,
                        statusMessage: `Proxy error: ${err.message}`
                    }))
                }
            })

            proxyRequest.end()
        })

    try {
        await makeRequest(videoUrl)
    } catch (error) {
        // Only send error if client hasn't disconnected and headers haven't been sent
        if (!clientDisconnected && !event.node.res.headersSent) {
            console.error('Final proxy error:', error.message)
            return sendError(event, error)
        }
    } finally {
        if (idleCheckInterval) {
            clearInterval(idleCheckInterval)
        }
    }
})