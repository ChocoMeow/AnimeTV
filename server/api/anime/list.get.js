import { parseAnimeListQuery } from '#shared/contracts/anime'
import { serverSupabaseClient } from '#supabase/server'
import { logError } from '~~/server/utils/logger'
import { getAnimeList } from '~~/server/services/anime.service.js'

/** GET /api/anime/list */
export default defineEventHandler(async (event) => {
    await authUser(event)

    try {
        const { page, tags, categories, sort, category } = parseAnimeListQuery(getQuery(event))
        const client = category === '自訂作品' ? await serverSupabaseClient(event) : null

        return await getAnimeList(client, {
            page,
            tags,
            categories,
            sort,
            category,
        })
    } catch (err) {
        if (err?.statusCode && err.statusCode < 500) throw err
        logError(event, err, { module: 'anime-list' })
        return { results: [], totalPage: '0' }
    }
})
