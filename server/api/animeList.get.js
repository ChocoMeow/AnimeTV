import { serverSupabaseClient } from "#supabase/server"
import { logError } from "~~/server/utils/logger"
import { getAnimeList } from "~~/server/services/anime.service.js"

// Nuxt API handler — URL stays /api/animeList
export default defineEventHandler(async (event) => {
    await authUser(event)

    try {
        const query = getQuery(event)
        const page = query.page || 1
        const tags = query.tags ? query.tags.split(",") : []
        const categories = query.categories ? query.categories.split(",") : []
        const sort = query.sort || null
        const client = query.category === "自訂作品" ? await serverSupabaseClient(event) : null

        return await getAnimeList(client, {
            page,
            tags,
            categories,
            sort,
            category: query.category,
        })
    } catch (err) {
        logError(event, err, { module: "animeList" })
        return { results: [], totalPage: "0" }
    }
})
