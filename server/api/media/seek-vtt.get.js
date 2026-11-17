import { createLoggedError, logError } from '~~/server/utils/logger'
import { openMediaProxy, rewriteThumbnailsVtt } from '~~/server/utils/mediaTokens'
import {
    VIDEO_UPSTREAM,
    armProxySocketTimeout,
    bindClientAbort,
    combinedSignal,
    videoUpstreamHeaders,
} from '~~/server/utils/videoUpstream'

const { timeoutMs } = VIDEO_UPSTREAM

/** Seek-thumbnail WebVTT: fetch upstream, rewrite sprites → `/api/media/file`. */
export default defineEventHandler(async (event) => {
    const { t } = getQuery(event)
    const { url, cookie, referer, userId } = openMediaProxy(typeof t === 'string' ? t : '')
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
                    accept: 'text/vtt,*/*',
                }),
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
                statusMessage: 'Upstream seek VTT failed',
                context: { module: 'media-seek-vtt', stage: 'upstream', status: res.status, userId },
            })
        }

        const raw = (await res.text()).replace(/^\uFEFF/, '')
        if (!raw || !/WEBVTT/i.test(raw)) {
            throw createLoggedError(event, {
                statusCode: 502,
                statusMessage: 'Upstream seek VTT invalid',
                context: { module: 'media-seek-vtt', stage: 'parse', userId },
            })
        }

        const text = rewriteThumbnailsVtt(raw, String(url), { api: 'media/file', cookie, referer, userId })
        const body = Buffer.from(text, 'utf8')
        setResponseStatus(event, 200)
        setResponseHeader(event, 'Content-Type', 'text/vtt; charset=utf-8')
        setResponseHeader(event, 'Content-Length', String(body.length))
        setResponseHeader(event, 'Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800')
        setResponseHeader(event, 'CDN-Cache-Control', 'public, max-age=86400')
        setResponseHeader(event, 'Access-Control-Allow-Origin', '*')
        return body
    } catch (err) {
        if (err?.name === 'AbortError' || clientAbort.signal.aborted) return
        if (!event.node.res.headersSent) {
            if (err?.data?.errorId) return sendError(event, err)
            if (err?.statusCode && err.statusCode < 500) return sendError(event, err)
            return sendError(
                event,
                createLoggedError(event, {
                    statusCode: err?.statusCode || 502,
                    statusMessage: err?.message || 'Seek VTT proxy error',
                    err,
                    context: { module: 'media-seek-vtt', userId },
                }),
            )
        }
        logError(event, err, { module: 'media-seek-vtt', stage: 'after_headers', userId })
    }
})
