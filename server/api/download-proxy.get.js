import { createLoggedError, logError } from '~~/server/utils/logger'
import {
    VIDEO_UPSTREAM,
    bindClientAbort,
    combinedSignal,
    videoUpstreamHeaders,
} from '~~/server/utils/videoUpstream'

const { timeoutMs } = VIDEO_UPSTREAM

export default defineEventHandler(async (event) => {
    await authUser(event)

    const { url, cookie } = getQuery(event)
    if (!url) {
        return sendError(event, createError({ statusCode: 400, statusMessage: 'Missing parameters' }))
    }

    const cookieHeader = cookie == null ? '' : String(cookie)
    const clientAbort = bindClientAbort(event)

    try {
        if (clientAbort.signal.aborted) return

        let parsed
        try {
            parsed = new URL(String(url))
        } catch {
            throw createError({ statusCode: 400, statusMessage: 'Invalid URL' })
        }

        const upstream = combinedSignal(clientAbort.signal, timeoutMs)
        let res
        try {
            res = await fetch(String(url), {
                method: 'GET',
                redirect: 'follow',
                signal: upstream.signal,
                headers: videoUpstreamHeaders(parsed, { cookie: cookieHeader, accept: '*/*' }),
            })
            upstream.clearTimer()
        } catch (err) {
            upstream.dispose()
            throw err
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
