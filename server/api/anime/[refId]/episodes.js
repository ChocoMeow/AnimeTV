import { listAnimeEpisodes } from '~~/server/services/playback.service.js'

export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const refId = getRouterParam(event, 'refId')
    const episodes = await listAnimeEpisodes(event, refId, userId)

    setHeader(event, 'Cache-Control', 'private, no-cache, must-revalidate')
    return { episodes }
})
