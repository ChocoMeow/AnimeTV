import { getRequestLogger, logError } from '~~/server/utils/logger'
import { mediaProxyUrl } from '~~/server/utils/mediaTokens'
import {
    assembleCaptions,
    assembleThumbnailsFromPlayback,
    resolveOwnedPlayback,
} from '~~/server/utils/playbackAssembly'

/** Standard playback body: stream + captions + seek thumbnails + chapters. */
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
        return {
            proxyUrl: mediaProxyUrl('proxy-video', { url, cookie, referer, hls: isHls, userId }),
            isHls,
            ...assembleCaptions(result.captions, ctx),
            ...assembleThumbnailsFromPlayback(sealed, result, ctx),
            ...(result?.chapters ? { chapters: result.chapters } : {}),
        }
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        logError(event, err, { module: 'episode', userId })
        return { error: err.message || 'Failed to fetch video' }
    }
})
