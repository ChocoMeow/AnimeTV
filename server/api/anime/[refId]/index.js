import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { getAnimeDetail } from '~~/server/services/animeMeta.service.js'

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const serviceClient = await serverSupabaseServiceRole(event)
    const refId = getRouterParam(event, 'refId')
    const query = getQuery(event)
    const withRelated = query.withRelated === 'true'

    const body = await getAnimeDetail(event, {
        client,
        serviceClient,
        refId,
        userId: user.sub,
        withRelated,
    })

    setHeader(event, 'Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return body
})
