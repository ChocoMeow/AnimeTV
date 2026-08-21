import { serverSupabaseClient } from '#supabase/server'
import { createLoggedError } from '~~/server/utils/logger'
import { isValidVideoSource, VIDEO_SOURCES } from '~~/server/lib/videoProviders'
import { stripSelfRelated, syncRelatedLinks } from '~~/server/utils/animeMetaRelated'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const client = await serverSupabaseClient(event)
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

    const [{ data: existing, error: existingError }, fieldTypes] = await Promise.all([
        client.from('anime_meta').select('related_anime_source_ids').eq('source_id', sourceId).maybeSingle(),
        getFieldTypesFromData(client, 'anime_meta', Object.keys(body)),
    ])

    if (existingError) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to load anime meta record',
            err: existingError,
            context: { module: 'admin-anime-meta', sourceId },
        })
    }
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Anime meta record not found' })

    const { data, error } = await client
        .from('anime_meta')
        .update(stripSelfRelated(convertBody(body, fieldTypes), sourceId))
        .eq('source_id', sourceId)
        .select('*')
        .maybeSingle()

    if (error) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to update anime meta record',
            err: error,
            context: { module: 'admin-anime-meta', sourceId },
        })
    }
    if (!data) throw createError({ statusCode: 404, statusMessage: 'Anime meta record not found' })

    try {
        await syncRelatedLinks(client, data.source_id, data.related_anime_source_ids, existing.related_anime_source_ids)
    } catch (err) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Updated anime meta, but failed to sync related links',
            err,
            context: { module: 'admin-anime-meta', sourceId: data.source_id },
        })
    }

    return data
})
