import { serverSupabaseClient } from '#supabase/server'
import { listEpisodesForSource, normalizeVideoSource, DEFAULT_VIDEO_SOURCE } from '~~/server/lib/videoProviders'

const fetchVideoMeta = async (client, sourceId) => {
    const { data } = await client
        .from('anime_meta')
        .select('video_id, video_source')
        .eq('source_id', sourceId)
        .maybeSingle()
    return {
        videoId: data?.video_id ?? null,
        videoSource: normalizeVideoSource(data?.video_source) || DEFAULT_VIDEO_SOURCE,
    }
}

export default defineEventHandler(async (event) => {
    await authUser(event)
    const client = await serverSupabaseClient(event)
    const refId = getRouterParam(event, 'refId')

    const { videoId, videoSource } = await fetchVideoMeta(client, refId)
    if (!videoId) {
        throw createError({ statusCode: 404, statusMessage: 'Anime video_id not found' })
    }

    const episodes = await listEpisodesForSource(event, videoSource, videoId)
    setHeader(event, 'Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return { episodes }
})
