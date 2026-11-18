import { serverSupabaseServiceRole } from '#supabase/server'
import { CACHE_LIFETIME } from '#shared/utils/global'
import { logError } from '~~/server/utils/logger'
import { getWelcomePreview } from '~~/server/services/anime.service.js'

export default defineCachedEventHandler(
    async (event) => {
        try {
            const client = await serverSupabaseServiceRole(event)
            return await getWelcomePreview(client)
        } catch (err) {
            logError(event, err, { module: 'public-welcome-preview' })
            return { spotlight: [], byDay: {}, browse: [], posters: [] }
        }
    },
    { maxAge: CACHE_LIFETIME / 1000, swr: true, getKey: () => 'public-welcome-preview' },
)
