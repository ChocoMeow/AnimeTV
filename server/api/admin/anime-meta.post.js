import { serverSupabaseClient } from '#supabase/server'

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

    const { data, error } = await client.from('anime_meta').insert(body).select('*').single()

    if (error) {
        console.error('Failed to insert anime_meta record:', error)
        throw createError({
            statusCode: 500,
            statusMessage: 'Failed to create anime meta record',
        })
    }

    return data
})
