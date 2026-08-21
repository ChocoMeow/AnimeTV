import { logError } from '~~/server/utils/logger'
import { resolvePlaybackForToken } from '~~/server/lib/videoProviders'

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
        const videoCookie = result.videoCookie || ''
        const isM3u8 = /\.m3u8(\?|$)/i.test(finalUrl) || finalUrl.toLowerCase().includes('m3u8')

        if (isM3u8) {
            return {
                kind: 'hls',
                playlistUrl: `/api/proxy-video?url=${encodeURIComponent(finalUrl)}&cookie=${encodeURIComponent(videoCookie)}`,
            }
        }

        return {
            kind: 'mp4',
            downloadUrl: `/api/download-proxy?url=${encodeURIComponent(finalUrl)}&cookie=${encodeURIComponent(videoCookie)}`,
        }
    } catch (err) {
        logError(event, err, { module: 'download-video' })
        return {
            error: err?.statusMessage || err?.message || 'Failed to resolve download source',
        }
    }
})
