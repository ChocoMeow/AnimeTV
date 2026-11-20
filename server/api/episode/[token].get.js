import { parseEpisodeTokenParam } from '#shared/contracts/episode'
import { getRequestLogger, logError } from '~~/server/utils/logger'
import { getEpisodePlayback } from '~~/server/services/playback.service.js'

/** GET /api/episode/:token — standard playback body. */
export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const log = getRequestLogger(event)
    const token = parseEpisodeTokenParam(getRouterParam(event, 'token'))

    try {
        return await getEpisodePlayback(token, userId, log)
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        logError(event, err, { module: 'episode', userId })
        return { error: err.message || 'Failed to fetch video' }
    }
})
