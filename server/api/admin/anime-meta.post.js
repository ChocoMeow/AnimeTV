import { isValidVideoSource, DEFAULT_VIDEO_SOURCE, VIDEO_SOURCES } from '~~/server/lib/videoProviders'
import { createAnimeMeta } from '~~/server/services/admin.service.js'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const body = await readBody(event)

    if (!body || typeof body !== 'object') {
        throw createError({ statusCode: 400, statusMessage: 'Invalid request body' })
    }

    if (body.video_source != null && body.video_source !== '' && !isValidVideoSource(body.video_source)) {
        throw createError({
            statusCode: 400,
            statusMessage: `video_source must be one of: ${VIDEO_SOURCES.join(', ')}`,
        })
    }
    if (!body.video_source) body.video_source = DEFAULT_VIDEO_SOURCE

    return createAnimeMeta(event, body)
})
