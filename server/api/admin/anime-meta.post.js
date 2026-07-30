import { serverSupabaseClient } from '#supabase/server'
import { createLoggedError } from '~~/server/utils/logger'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const client = await serverSupabaseClient(event)
    const body = await readBody(event)

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

    const { data, error } = await client.from('anime_meta').insert(convertedBody).select('*').single()

    if (error) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to create anime meta record',
            err: error,
            context: { module: 'admin-anime-meta' },
        })
    }

    return data
})
