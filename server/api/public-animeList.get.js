import { serverSupabaseServiceRole } from '#supabase/server'
import { CACHE_LIFETIME } from '~~/shared/global'
import { logError } from '~~/server/utils/logger'

const LIMIT = 50

export default defineCachedEventHandler(
    async (event) => {
        try {
            const client = await serverSupabaseServiceRole(event)
            const { data, error } = await client
                .from('anime_meta')
                .select('thumbnail')
                .not('thumbnail', 'is', null)
                .order('premiere_date', { ascending: false, nullsFirst: false })
                .limit(LIMIT)

            if (error) throw error

            return (data ?? [])
                .map((row) => row.thumbnail)
                .filter((url) => typeof url === 'string' && /^https?:\/\//.test(url))
        } catch (err) {
            logError(event, err, { module: 'public-animeList' })
            return []
        }
    },
    { maxAge: CACHE_LIFETIME / 1000, swr: true, getKey: () => 'public-animeList' },
)
