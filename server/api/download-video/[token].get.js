import { isDirectHlsHost, resolvePlaybackForSource } from '~~/server/lib/videoProviders'
import { logError } from '~~/server/utils/logger'
import { mediaProxyUrl, openOwnedEpisodeToken, playbackMetaFrom } from '~~/server/utils/mediaTokens'
import { absoluteMediaUrl, urlLooksHls } from '~~/server/utils/videoUpstream'

function proxyOrDirect(url, cookie, userId) {
    if (!urlLooksHls(url)) {
        return { kind: 'mp4', downloadUrl: mediaProxyUrl('download-proxy', { url, cookie, userId }) }
    }
    try {
        if (!cookie && isDirectHlsHost(new URL(url).hostname)) {
            return { kind: 'hls', playlistUrl: url }
        }
    } catch { /* proxy */ }
    return { kind: 'hls', playlistUrl: mediaProxyUrl('proxy-video', { url, cookie, userId }) }
}

export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    try {
        const sealed = openOwnedEpisodeToken(getRouterParam(event, 'token'), userId)
        const result = await resolvePlaybackForSource(sealed.source, sealed.token)
        const url = absoluteMediaUrl(result?.s?.[0]?.src)
        if (!url) throw createError({ statusCode: 404, statusMessage: 'No available source' })

        return {
            ...proxyOrDirect(url, result.videoCookie || '', userId),
            ...playbackMetaFrom(sealed, result),
        }
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        logError(event, err, { module: 'download-video', userId })
        return { error: err?.statusMessage || err?.message || 'Failed to resolve download source' }
    }
})
