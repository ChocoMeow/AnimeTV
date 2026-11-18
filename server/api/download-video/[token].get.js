import { logError } from '~~/server/utils/logger'
import { getDownloadPlayback } from '~~/server/services/playback.service.js'

/** Offline source + seek thumbnails (same resolve, one response). */
export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    try {
        return await getDownloadPlayback(getRouterParam(event, 'token'), userId)
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        logError(event, err, { module: 'download-video', userId })
        return { error: err?.statusMessage || err?.message || 'Failed to resolve download source' }
    }
})
