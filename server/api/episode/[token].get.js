import { getRequestLogger, logError } from '~~/server/utils/logger'
import { resolvePlaybackForToken } from '~~/server/lib/videoProviders'

export default defineEventHandler(async (event) => {
    await authUser(event)
    const log = getRequestLogger(event)

    const { token } = event.context.params

    try {
        const result = await resolvePlaybackForToken(token)
        log.debug({ hasVideoCookie: Boolean(result?.videoCookie) }, 'Video resolve ok')
        return result
    } catch (err) {
        logError(event, err, { module: 'episode' })
        return { error: err.message || 'Failed to fetch video' }
    }
})
