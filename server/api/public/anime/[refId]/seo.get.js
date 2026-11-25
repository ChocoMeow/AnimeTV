import { serverSupabaseServiceRole } from '#supabase/server'
import { getPublicAnimeSeo } from '~~/server/services/animeMeta.service.js'

export default defineCachedEventHandler(
    async (event) => {
        const refId = getRouterParam(event, 'refId')
        if (!refId || !/^\d{1,10}$/.test(refId)) {
            throw createError({ statusCode: 400, statusMessage: 'Invalid anime id' })
        }

        const client = await serverSupabaseServiceRole(event)
        return getPublicAnimeSeo(event, client, refId)
    },
    {
        maxAge: 300,
        swr: true,
        getKey: (event) => `anime-seo:${getRouterParam(event, 'refId')}`,
    },
)
