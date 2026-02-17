import { serverSupabaseClient } from '#supabase/server'

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

    // Get field types dynamically and convert body
    const fields = Object.keys(body)
    const fieldTypes = await getFieldTypesFromData(client, 'anime_meta', fields)
    const convertedBody = convertBody(body, fieldTypes)

    const { data, error } = await client.from('anime_meta').update(convertedBody).eq('source_id', sourceId).select('*').maybeSingle()

    if (error) {
        console.error('Failed to update anime_meta record:', error)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to update anime meta record',
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
