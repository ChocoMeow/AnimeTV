import { parseEpisodeTokenParam } from '#shared/contracts/episode'
import { logError } from '~~/server/utils/logger'
import { getDownloadPlayback } from '~~/server/services/playback.service.js'

/** GET /api/media/download/:token — offline source + seek thumbnails. */
export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const token = parseEpisodeTokenParam(getRouterParam(event, 'token'))
    try {
        return await getDownloadPlayback(token, userId)
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        logError(event, err, { module: 'media-download', userId })
        return { error: err?.statusMessage || err?.message || 'Failed to resolve download source' }
    }
})
