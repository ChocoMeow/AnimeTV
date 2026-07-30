import { serverSupabaseClient } from '#supabase/server'
import { createLoggedError } from '~~/server/utils/logger'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const client = await serverSupabaseClient(event)
    const { sourceId } = getRouterParams(event)

    if (!sourceId) {
        throw createError({
            statusCode: 400,
            statusMessage: 'Missing sourceId parameter',
        })
    }

    const { error } = await client.from('anime_meta').delete().eq('source_id', sourceId)

    if (error) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to delete anime meta record',
            err: error,
            context: { module: 'admin-anime-meta' },
        })
    }

    return { success: true }
})
