import { createLoggedError, logError } from '~~/server/utils/logger'
import { openMediaProxy } from '~~/server/utils/mediaTokens'
import {
    VIDEO_UPSTREAM,
    armProxySocketTimeout,
    bindClientAbort,
    combinedSignal,
    videoUpstreamHeaders,
} from '~~/server/utils/videoUpstream'

const { timeoutMs } = VIDEO_UPSTREAM

/** Sealed opaque bytes: captions, sprites, progressive MP4. Seek VTT → `/api/media/seek-vtt`. */
export default defineEventHandler(async (event) => {
    const { t } = getQuery(event)
    const { url, cookie, referer, userId } = openMediaProxy(typeof t === 'string' ? t : '')
    const range = getRequestHeader(event, 'range') || ''
    const clientAbort = bindClientAbort(event)
    armProxySocketTimeout(event, clientAbort)

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
                headers: videoUpstreamHeaders(parsed, {
                    cookie,
                    referer,
                    accept: '*/*',
                    range: range || undefined,
                }),
            })
            upstream.clearTimer()
        } catch (err) {
            upstream.dispose()
            throw err
        }

        if (!res.ok && res.status !== 206) {
            res.body?.cancel?.().catch(() => {})
            throw createLoggedError(event, {
                statusCode: res.status >= 400 ? res.status : 502,
                statusMessage: 'Upstream media fetch failed',
                context: { module: 'media-file', stage: 'upstream', status: res.status, userId },
            })
        }
        if (!res.body) {
            throw createLoggedError(event, {
                statusCode: 502,
                statusMessage: 'Empty upstream body',
                context: { module: 'media-file', stage: 'upstream', userId },
            })
        }

        const contentType = res.headers.get('content-type') || 'application/octet-stream'
        setResponseStatus(event, res.status)
        setResponseHeader(event, 'Content-Type', contentType)
        const len = res.headers.get('content-length')
        if (len) {
            setResponseHeader(event, 'Content-Length', len)
            setResponseHeader(event, 'X-Content-Length', len)
        }
        const contentRange = res.headers.get('content-range')
        if (contentRange) setResponseHeader(event, 'Content-Range', contentRange)
        const acceptRanges = res.headers.get('accept-ranges')
        if (acceptRanges) setResponseHeader(event, 'Accept-Ranges', acceptRanges)

        const cacheable =
            /^image\//i.test(contentType)
            || /^text\/vtt/i.test(contentType)
            || /\.(?:webp|jpe?g|png|gif|avif|vtt)$/i.test(parsed.pathname)
        setResponseHeader(
            event,
            'Cache-Control',
            cacheable ? 'public, max-age=86400, stale-while-revalidate=604800' : 'no-store',
        )
        if (cacheable) setResponseHeader(event, 'CDN-Cache-Control', 'public, max-age=86400')
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
                    statusMessage: err?.message || 'Media file proxy error',
                    err,
                    context: { module: 'media-file', userId },
                }),
            )
        }
        logError(event, err, { module: 'media-file', stage: 'after_headers', userId })
    }
})
