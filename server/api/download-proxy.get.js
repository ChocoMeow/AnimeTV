import { createLoggedError, logError } from '~~/server/utils/logger'
import {
    VIDEO_UPSTREAM,
    bindClientAbort,
    combinedSignal,
    videoUpstreamHeaders,
} from '~~/server/utils/videoUpstream'

const { timeoutMs, maxRedirects } = VIDEO_UPSTREAM

export default defineEventHandler(async (event) => {
    await authUser(event)

    const { url, cookie } = getQuery(event)
    if (!url) {
        return sendError(event, createError({ statusCode: 400, statusMessage: 'Missing parameters' }))
    }

    const cookieHeader = cookie == null ? '' : String(cookie)
    const clientAbort = bindClientAbort(event)

    try {
        let current = String(url)
        for (let hop = 0; hop <= maxRedirects; hop++) {
            if (clientAbort.signal.aborted) return

            let parsed
            try {
                parsed = new URL(current)
            } catch {
                throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
            }

            const upstream = combinedSignal(clientAbort.signal, timeoutMs)
            let res
            try {
                res = await fetch(current, {
                    method: 'GET',
                    redirect: 'manual',
                    signal: upstream.signal,
                    headers: videoUpstreamHeaders(parsed, { cookie: cookieHeader, accept: '*/*' }),
                })
                upstream.clearTimer()
            } catch (err) {
                upstream.dispose()
                throw err
            }

            if (res.status >= 300 && res.status < 400) {
                const loc = res.headers.get('location')
                if (!loc) break
                // Drain/cancel unused body so sockets free quickly.
                res.body?.cancel?.().catch(() => {})
                if (hop === maxRedirects) {
                    throw createLoggedError(event, {
                        statusCode: 508,
                        statusMessage: 'Too many redirects',
                        context: { module: 'download-proxy', stage: 'redirect' },
                    })
                }
                current = new URL(loc, current).toString()
                continue
            }

            if (!res.ok) {
                res.body?.cancel?.().catch(() => {})
                throw createLoggedError(event, {
                    statusCode: res.status >= 400 ? res.status : 502,
                    statusMessage: 'Upstream download failed',
                    context: { module: 'download-proxy', stage: 'upstream', status: res.status },
                })
            }

            if (!res.body) {
                throw createLoggedError(event, {
                    statusCode: 502,
                    statusMessage: 'Empty upstream body',
                    context: { module: 'download-proxy', stage: 'upstream' },
                })
            }

            setResponseStatus(event, 200)
            setResponseHeader(event, 'Content-Type', res.headers.get('content-type') || 'video/mp4')
            const len = res.headers.get('content-length')
            if (len) setResponseHeader(event, 'Content-Length', len)
            setResponseHeader(event, 'Cache-Control', 'no-store')
            setResponseHeader(event, 'Access-Control-Allow-Origin', '*')

            return sendStream(event, res.body)
        }

        throw createLoggedError(event, {
            statusCode: 508,
            statusMessage: 'Too many redirects',
            context: { module: 'download-proxy', stage: 'redirect' },
        })
    } catch (err) {
        if (err?.name === 'AbortError' || clientAbort.signal.aborted) return
        if (!event.node.res.headersSent) {
            if (err?.data?.errorId) return sendError(event, err)
            if (err?.statusCode && err.statusCode < 500) return sendError(event, err)
            return sendError(
                event,
                createLoggedError(event, {
                    statusCode: err?.statusCode || 502,
                    statusMessage: err?.message || 'Proxy error',
                    err,
                    context: { module: 'download-proxy' },
                }),
            )
        }
        logError(event, err, { module: 'download-proxy', stage: 'after_headers' })
    }
})
