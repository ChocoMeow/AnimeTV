import { isValidVideoSource, DEFAULT_VIDEO_SOURCE, VIDEO_SOURCES } from '~~/server/lib/videoProviders'
import { createLoggedError } from '~~/server/utils/logger'
import { stripSelfRelated, syncRelatedLinks } from '~~/server/utils/animeMetaRelated'
import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const client = await serverSupabaseClient(event)
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

    const fieldTypes = await getFieldTypesFromData(client, 'anime_meta', Object.keys(body))
    const convertedBody = stripSelfRelated(convertBody(body, fieldTypes))

    const { data, error } = await client.from('anime_meta').insert(convertedBody).select('*').single()
    if (error) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to create anime meta record',
            err: error,
            context: { module: 'admin-anime-meta' },
        })
    }

    try {
        await syncRelatedLinks(client, data.source_id, data.related_anime_source_ids)
    } catch (err) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Created anime meta, but failed to sync related links',
            err,
            context: { module: 'admin-anime-meta', sourceId: data.source_id },
        })
    }

    return data
})
