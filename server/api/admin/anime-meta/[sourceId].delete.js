import { serverSupabaseClient } from '#supabase/server'

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
        console.error('Failed to delete anime_meta record:', error)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to delete anime meta record',
        })
    }

    return { success: true }
})
