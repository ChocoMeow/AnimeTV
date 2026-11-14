import { getRequestLogger, logError } from '~~/server/utils/logger'
import { mediaProxyUrl } from '~~/server/utils/mediaTokens'
import {
    assembleCaptions,
    resolveOwnedPlayback,
    withProxiedThumbnails,
} from '~~/server/utils/playbackAssembly'

export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const log = getRequestLogger(event)

    try {
        const { sealed, result, url, cookie, referer, isHls } = await resolveOwnedPlayback(
            getRouterParam(event, 'token'),
            userId,
        )
        if (!url) return { error: 'No available source' }

        log.debug({ source: sealed.source, isHls, userId }, 'Video resolve ok')

        const ctx = { cookie, referer, userId, source: sealed.source }
        const meta = await withProxiedThumbnails(sealed, result, ctx)
        const captionBundle = assembleCaptions(result.captions, ctx)
        // Never return upstream stream / caption / sprite URLs — only sealed proxies.
        return {
            proxyUrl: mediaProxyUrl('proxy-video', { url, cookie, referer, hls: isHls, userId }),
            isHls,
            ...meta,
            ...captionBundle,
        }
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        logError(event, err, { module: 'episode', userId })
        return { error: err.message || 'Failed to fetch video' }
    }
})
