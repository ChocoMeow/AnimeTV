import { serverSupabaseClient } from "#supabase/server"
import { createLoggedError } from "~~/server/utils/logger"
import { getAnimeHome } from "~~/server/services/anime.service.js"

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    try {
        return await getAnimeHome(client, user?.id ?? user?.sub ?? null)
    } catch (error) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: "Internal Server Error",
            err: error,
            context: { module: "anime-index" },
        })
    }
})
