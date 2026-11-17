import { isDirectHlsHost } from '~~/server/lib/videoProviders'
import { logError } from '~~/server/utils/logger'
import { mediaProxyUrl } from '~~/server/utils/mediaTokens'
import { assembleThumbnailsFromPlayback, resolveOwnedPlayback } from '~~/server/utils/playbackAssembly'
import { urlLooksHls } from '~~/server/utils/videoUpstream'

function proxyOrDirect(url, cookie, referer, userId) {
    if (!urlLooksHls(url)) {
        return { kind: 'mp4', downloadUrl: mediaProxyUrl('media/file', { url, cookie, referer, userId }) }
    }
    try {
        if (!cookie && !referer && isDirectHlsHost(new URL(url).hostname)) {
            return { kind: 'hls', playlistUrl: url }
        }
    } catch { /* proxy */ }
    return { kind: 'hls', playlistUrl: mediaProxyUrl('proxy-video', { url, cookie, referer, hls: true, userId }) }
}

/** Offline source + seek thumbnails (same resolve, one response). */
export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    try {
        const { sealed, result, url, cookie, referer } = await resolveOwnedPlayback(
            getRouterParam(event, 'token'),
            userId,
        )
        if (!url) throw createError({ statusCode: 404, statusMessage: 'No available source' })

        return {
            ...proxyOrDirect(url, cookie, referer, userId),
            ...assembleThumbnailsFromPlayback(sealed, result, { cookie, referer, userId }),
        }
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        logError(event, err, { module: 'download-video', userId })
        return { error: err?.statusMessage || err?.message || 'Failed to resolve download source' }
    }
})
