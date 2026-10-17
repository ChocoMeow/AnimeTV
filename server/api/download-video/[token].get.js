import { DIRECT_HLS_HOST } from '#shared/utils/videoSources'
import { downloadProxyUrl, proxyVideoUrl } from '#shared/utils/offline'
import { logError } from '~~/server/utils/logger'
import { resolvePlaybackForToken } from '~~/server/lib/videoProviders'
import { isHlsPlaylist } from '~~/server/utils/videoUpstream'

function downloadSource(finalUrl, cookie) {
    const hls = isHlsPlaylist(finalUrl) || finalUrl.toLowerCase().includes('m3u8')
    let host = ''
    try {
        host = new URL(finalUrl).hostname
    } catch {
        /* ignore */
    }
    if (hls) {
        const direct = !cookie && DIRECT_HLS_HOST.test(host)
        return { kind: 'hls', playlistUrl: direct ? finalUrl : proxyVideoUrl(finalUrl, cookie) }
    }
    return { kind: 'mp4', downloadUrl: downloadProxyUrl(finalUrl, cookie) }
}

export default defineEventHandler(async (event) => {
    await authUser(event)
    const { token } = event.context.params

    try {
        const result = await resolvePlaybackForToken(token)
        if (!result?.s?.length) {
            throw createError({ statusCode: 404, statusMessage: 'No available source' })
        }

        const raw = result.s[0].src
        const finalUrl = raw.startsWith('http') ? raw : `https:${raw}`
        return {
            ...downloadSource(finalUrl, result.videoCookie || ''),
            thumbnail_vtt_text: result.thumbnail_vtt_text || null,
            thumbnails_jpg_url: result.thumbnails_jpg_url || null,
            thumbnails_vtt_url: result.thumbnails_vtt_url || null,
        }
    } catch (err) {
        logError(event, err, { module: 'download-video' })
        return {
            error: err?.statusMessage || err?.message || 'Failed to resolve download source',
        }
    }
})
