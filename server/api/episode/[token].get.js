import { getRequestLogger, logError } from '~~/server/utils/logger'
import { getEpisodePlayback } from '~~/server/services/playback.service.js'

/** Standard playback body: stream + captions + seek thumbnails + chapters. */
export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const log = getRequestLogger(event)

    try {
        return await getEpisodePlayback(getRouterParam(event, 'token'), userId, log)
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        logError(event, err, { module: 'episode', userId })
        return { error: err.message || 'Failed to fetch video' }
    }
})
