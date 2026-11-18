import { serverSupabaseClient } from "#supabase/server"
import { searchAnimeResults } from "~~/server/services/search.service.js"

export default defineEventHandler(async (event) => {
    await authUser(event)

    const rawQuery = getRouterParam(event, "query") ?? ""
    const query = decodeURIComponent(rawQuery).trim()
    if (!query) return { results: [] }

    const client = await serverSupabaseClient(event)
    return searchAnimeResults(client, query)
})
