import { serverSupabaseClient } from '#supabase/server'
import { createLoggedError } from '~~/server/utils/logger'
import { syncRelatedLinks } from '~~/server/utils/animeMetaRelated'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const client = await serverSupabaseClient(event)
    const { sourceId } = getRouterParams(event)
    if (!sourceId) throw createError({ statusCode: 400, statusMessage: 'Missing sourceId parameter' })

    const { data: existing, error: existingError } = await client
        .from('anime_meta')
        .select('source_id, related_anime_source_ids')
        .eq('source_id', sourceId)
        .maybeSingle()

    if (existingError) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to load anime meta record',
            err: existingError,
            context: { module: 'admin-anime-meta', sourceId },
        })
    }
    if (!existing) throw createError({ statusCode: 404, statusMessage: 'Anime meta record not found' })

    try {
        await syncRelatedLinks(client, existing.source_id, [], existing.related_anime_source_ids)
    } catch (err) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to sync related links before delete',
            err,
            context: { module: 'admin-anime-meta', sourceId },
        })
    }

    const { error } = await client.from('anime_meta').delete().eq('source_id', sourceId)
    if (error) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to delete anime meta record',
            err: error,
            context: { module: 'admin-anime-meta', sourceId },
        })
    }

    return { success: true }
})
