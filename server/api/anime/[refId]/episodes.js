import * as cheerio from 'cheerio'
import { serverSupabaseClient } from '#supabase/server'

const extractEpisodeIdentifier = (fullTitle) => {
    const matches = fullTitle.match(/\[([^\]]+)\]/g)
    return matches?.length ? matches[matches.length - 1].slice(1, -1) : null
}

const normalizeEpisodeId = (id) => (/^\d+$/.test(id) ? String(Number(id)) : id)

async function fetchEpisodeTokens(categoryId) {
    const episodes = {}
    let nextPageUrl = `${ANIME1_BASE_URL}?cat=${categoryId}`

    try {
        while (nextPageUrl) {
            const { html } = await cfFetch(nextPageUrl)
            const $ = cheerio.load(html)

            $('article').each((_, el) => {
                const fullTitle = $(el).find('h2.entry-title a').text().trim()
                const $video = $(el).find('.video-js')
                const token = $video.attr('data-apireq')
                const videoId = $video.attr('data-vid') || null
                const tserver = $video.attr('data-tserver')?.trim() || null

                if (!fullTitle || !token) return

                const identifier = extractEpisodeIdentifier(fullTitle)
                if (!identifier) return

                identifier.split('+').forEach((id) => {
                    const vid = videoId != null ? String(videoId).trim() : ''
                    const host = (tserver && String(tserver).trim()) || 'pt'
                    const thumbBase = vid ? `https://${host}.anime1.me/${vid}` : null
                    episodes[normalizeEpisodeId(id.trim())] = {
                        video_id: videoId,
                        token,
                        thumbnails_jpg_url: thumbBase ? `${thumbBase}/thumbnails.jpg` : null,
                        thumbnails_vtt_url: thumbBase ? `${thumbBase}/thumbnails.vtt` : null,
                    }
                })
            })

            nextPageUrl = $('.nav-previous a').attr('href') || null
        }
    } catch (err) {
        console.error(`Error fetching episodes for category ${categoryId}:`, err)
    }

    return episodes
}

const fetchVideoId = async (client, sourceId) => {
    const { data } = await client
        .from('anime_meta')
        .select('video_id')
        .eq('source_id', sourceId)
        .maybeSingle()
    return data?.video_id ?? null
}

export default defineEventHandler(async (event) => {
    const client = await serverSupabaseClient(event)
    const refId = getRouterParam(event, 'refId')

    const videoId = await fetchVideoId(client, refId)
    if (!videoId) throw createError({ statusCode: 404, statusMessage: 'Anime video_id not found' })

    const episodes = await fetchEpisodeTokens(videoId)
    setHeader(event, 'Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return { episodes }
})
