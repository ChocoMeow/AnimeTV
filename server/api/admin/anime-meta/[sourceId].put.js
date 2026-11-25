import { isValidVideoSource, VIDEO_SOURCES } from '~~/server/lib/videoProviders'
import { updateAnimeMeta } from '~~/server/services/admin.service.js'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const body = await readBody(event)
    const { sourceId } = getRouterParams(event)

    if (!sourceId) throw createError({ statusCode: 400, statusMessage: 'Missing sourceId parameter' })
    if (!body || typeof body !== 'object') {
        throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
    }

    if (body.video_source != null && body.video_source !== '' && !isValidVideoSource(body.video_source)) {
        throw createError({
            statusCode: 400,
            statusMessage: `video_source must be one of: ${VIDEO_SOURCES.join(', ')}`,
        })
    }

    return updateAnimeMeta(event, sourceId, body)
})
