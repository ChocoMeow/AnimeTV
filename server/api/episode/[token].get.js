import { resolvePlaybackForSource } from '~~/server/lib/videoProviders'
import { getRequestLogger, logError } from '~~/server/utils/logger'
import { mediaProxyUrl, openOwnedEpisodeToken, playbackMetaFrom } from '~~/server/utils/mediaTokens'
import { absoluteMediaUrl, urlLooksHls } from '~~/server/utils/videoUpstream'

export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const log = getRequestLogger(event)

    try {
        const sealed = openOwnedEpisodeToken(getRouterParam(event, 'token'), userId)
        const result = await resolvePlaybackForSource(sealed.source, sealed.token)
        const url = absoluteMediaUrl(result?.s?.[0]?.src)
        if (!url) return { error: 'No available source' }

        const isHls = urlLooksHls(url)
        log.debug({ source: sealed.source, isHls, userId }, 'Video resolve ok')

        // Never return stream URL / cookie / provider token (thumbs/video_id are plain).
        return {
            proxyUrl: mediaProxyUrl('proxy-video', { url, cookie: result.videoCookie || '', userId }),
            isHls,
            ...playbackMetaFrom(sealed, result),
            captions: Array.isArray(result.captions) ? result.captions : [],
        }
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        logError(event, err, { module: 'episode', userId })
        return { error: err.message || 'Failed to fetch video' }
    }
})
