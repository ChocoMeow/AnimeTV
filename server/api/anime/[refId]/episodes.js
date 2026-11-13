import { serverSupabaseClient } from '#supabase/server'
import { getProvider, listEpisodesForSource, normalizeVideoSource } from '~~/server/lib/videoProviders'
import { sealEpisodeToken } from '~~/server/utils/mediaTokens'

export default defineEventHandler(async (event) => {
    const userId = (await authUser(event)).sub
    const client = await serverSupabaseClient(event)
    const refId = getRouterParam(event, 'refId')

    const { data } = await client
        .from('anime_meta')
        .select('video_id, video_source')
        .eq('source_id', refId)
        .maybeSingle()

    const videoId = data?.video_id ?? null
    const videoSource = normalizeVideoSource(data?.video_source)
    if (!videoId) throw createError({ statusCode: 404, statusMessage: 'Anime video_id not found' })
    if (!videoSource) throw createError({ statusCode: 400, statusMessage: 'Unsupported or missing video_source' })

    const offlineQuality = Boolean(getProvider(videoSource)?.offlineQuality)
    const raw = await listEpisodesForSource(event, videoSource, videoId)
    const episodes = Object.fromEntries(
        Object.entries(raw || {}).map(([key, ep]) => {
            if (!ep?.token) return [key, ep]
            return [
                key,
                {
                    ...ep,
                    token: sealEpisodeToken(videoSource, ep, userId),
                    ...(offlineQuality ? { offlineQuality: true } : {}),
                },
            ]
        }),
    )

    setHeader(event, 'Cache-Control', 'private, no-cache, must-revalidate')
    return { episodes }
})
