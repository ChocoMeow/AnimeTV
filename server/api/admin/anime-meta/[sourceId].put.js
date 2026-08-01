import { serverSupabaseClient } from '#supabase/server'
import { createLoggedError } from '~~/server/utils/logger'
import { isValidVideoSource, VIDEO_SOURCES } from '~~/server/lib/videoProviders'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const client = await serverSupabaseClient(event)
    const body = await readBody(event)
    const { sourceId } = getRouterParams(event)

    if (!sourceId) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Missing sourceId parameter',
        })
    }

    if (!body || typeof body !== 'object') {
        throw createError({
            statusCode: 400,
            statusMessage: 'Invalid request body',
        })
    }

    if (body.video_source != null && body.video_source !== '' && !isValidVideoSource(body.video_source)) {
        throw createError({
            statusCode: 400,
            statusMessage: `video_source must be one of: ${VIDEO_SOURCES.join(', ')}`,
        })
    }

    // Get field types dynamically and convert body
    const fields = Object.keys(body)
    const fieldTypes = await getFieldTypesFromData(client, 'anime_meta', fields)
    const convertedBody = convertBody(body, fieldTypes)

    const { data, error } = await client.from('anime_meta').update(convertedBody).eq('source_id', sourceId).select('*').maybeSingle()

    if (error) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to update anime meta record',
            err: error,
            context: { module: 'admin-anime-meta' },
        })
    }

    if (!data) {
        throw createError({
            statusCode: 404,
            statusMessage: 'Anime meta record not found',
        })
    }

    return data
})
