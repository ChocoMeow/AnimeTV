import { serverSupabaseServiceRole } from '#supabase/server'
import { createLoggedError } from '~~/server/utils/logger'

const DESC_MAX = 200
const TITLE_MAX = 70

export default defineCachedEventHandler(
    async (event) => {
        const refId = getRouterParam(event, 'refId')
        if (!refId || !/^\d{1,10}$/.test(refId)) {
            throw createError({ statusCode: 400, statusMessage: 'Invalid anime id' })
        }

        const client = await serverSupabaseServiceRole(event)

        const { data, error } = await client
            .from('anime_meta')
            .select('title, description, thumbnail, views, score')
            .eq('source_id', refId)
            .maybeSingle()

        if (error) {
            throw createLoggedError(event, {
                statusCode: 500,
                statusMessage: 'Failed to load anime',
                err: error,
                context: { module: 'public-anime-seo' },
            })
        }
        if (!data) throw createError({ statusCode: 404, statusMessage: 'Anime not found' })

        return {
            title: data.title?.slice(0, TITLE_MAX) ?? '',
            description: data.description?.slice(0, DESC_MAX) ?? '',
            image: data.thumbnail ?? null,
            views: data.views ?? 0,
            score: data.score ?? 0,
        }
    },
    {
        maxAge: 300,
        swr: true,
        getKey: (event) => `anime-seo:${getRouterParam(event, 'refId')}`,
    },
)
