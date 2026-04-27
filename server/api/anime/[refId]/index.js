import * as cheerio from 'cheerio'
import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'

const ONE_MONTH_MS = 1000 * 60 * 60 * 24 * 30

// ============================================================================
// Utilities
// ============================================================================

const normalizeUserRating = (userRating) => {
    if (!userRating) return { score: '0.0', votes: 0 }
    const raw = Number(userRating.score ?? 0) || 0
    return {
        score: (Math.round(raw * 10) / 10).toFixed(1),
        votes: Number(String(userRating.count ?? userRating.votes ?? 0).replace(/[^\d]/g, '')) || 0,
    }
}

const parsePremiereDate = (value) => {
    if (!value) return null
    const str = String(value)
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (iso) return iso[0]
    const slash = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
    if (slash) return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`
    return null
}

const extractEpisodeIdentifier = (fullTitle) => {
    const matches = fullTitle.match(/\[([^\]]+)\]/g)
    return matches?.length ? matches[matches.length - 1].slice(1, -1) : null
}

const normalizeEpisodeId = (id) => (/^\d+$/.test(id) ? String(Number(id)) : id)

const isStale = (meta) => {
    const ms = new Date(meta?.updated_at).getTime()
    return !isNaN(ms) && Date.now() - ms > ONE_MONTH_MS
}

// ============================================================================
// Scrapers
// ============================================================================

async function scrapeAnimeDetailByRefId(refId) {
    if (!isValidNumberString(refId)) throw new Error(`Invalid reference ID: "${refId}"`)

    try {
        const { html } = await cfFetch(`${GAMER_BASE_URL}animeRef.php?sn=${refId}`)
        const $ = cheerio.load(html)
        const get = (sel, attr = null) => {
            const el = $(sel)
            return attr ? el.attr(attr)?.trim() || null : el.text().trim() || null
        }

        const title = get('.data-file img', 'alt')
        if (!title) {
            console.error('No title found for refId:', refId)
            return null
        }

        const premiereDate = get('.type-list li:nth-child(1) .content')
        const rawRelatedAnime = $('.old_list .anime_slider .theme-list-main')
            .map((_, el) => {
                const $el = $(el)
                const href = $el.attr('href') || ''
                return {
                    refId: href.match(/sn=(\d+)/)?.[1] || null,
                    image: $el.find('.theme-img').attr('data-src')?.trim() || null,
                    title: $el.find('.theme-name').text().trim() || null,
                    year: $el.find('.theme-time').text().trim() || null,
                    episodes: $el.find('.theme-number').text().trim() || null,
                    views: $el.find('.show-view-number p').text().trim() || null,
                }
            })
            .get()

        const [relatedAnime, mainMatchRow] = await Promise.all([
            matchAnime(rawRelatedAnime),
            matchAnime([{ refId, title, year: premiereDate }]).then((r) => r[0] ?? null),
        ])

        return {
            refId,
            detailId: get('.data .data-intro .link-button', 'href')?.match(/s=(\d+)/)?.[1] || null,
            title,
            description: get('.data .data-intro p'),
            views: get('.anime-title .anime_name .newanime-count span'),
            image: get('.data .data-img', 'data-src'),
            premiereDate,
            director: get('.type-list li:nth-child(2) .content'),
            distributor: get('.type-list li:nth-child(3) .content'),
            productionCompany: get('.type-list li:nth-child(4) .content'),
            tags: $('.type-list .tag-list li')
                .map((_, tag) => $(tag).text().trim())
                .get(),
            userRating: {
                score: get('.score-overall-number'),
                count: get('.score-overall-people')?.replace('人評價', '') || null,
            },
            relatedAnime,
            videoId: mainMatchRow?.matchedVideo?.id ?? null,
            season: mainMatchRow?.matchedVideo?.season ?? null,
        }
    } catch (err) {
        console.error('Error scraping anime detail:', err.message)
        return null
    }
}

async function fetchEpisodeTokens(categoryId) {
    const episodes = {}
    let seriesTitle = ''
    let nextPageUrl = `${ANIME1_BASE_URL}?cat=${categoryId}`

    try {
        while (nextPageUrl) {
            const { html } = await cfFetch(nextPageUrl)
            const $ = cheerio.load(html)

            if (!seriesTitle) seriesTitle = $('.page-title').text().trim() || 'Unknown Series'

            $('article').each((_, el) => {
                const fullTitle = $(el).find('h2.entry-title a').text().trim()
                const $video = $(el).find('.video-js')
                const token = $video.attr('data-apireq')
                const videoId = $video.attr('data-vid') || null

                if (!fullTitle || !token) return

                const identifier = extractEpisodeIdentifier(fullTitle)
                if (!identifier) return

                identifier.split('+').forEach((id) => {
                    episodes[normalizeEpisodeId(id.trim())] = { video_id: videoId, token }
                })
            })

            nextPageUrl = $('.nav-previous a').attr('href') || null
        }
    } catch (err) {
        console.error(`Error fetching episodes for category ${categoryId}:`, err)
    }

    return { categoryId, title: seriesTitle, episodes }
}

// ============================================================================
// Database
// ============================================================================

const batchFetchAnimeMeta = async (client, refIds) => {
    if (!refIds?.length) return new Map()
    const { data, error } = await client.from('anime_meta').select('*').in('source_id', refIds)
    if (error) console.error('Error batch fetching anime_meta:', error)
    return new Map((data || []).map((a) => [a.source_id, a]))
}

const upsertAnimeMeta = async (serviceClient, payload) => {
    const { data, error } = await serviceClient.from('anime_meta').upsert(payload, { onConflict: 'source_id', ignoreDuplicates: false }).select('*').single()
    if (error) {
        console.error('Error upserting anime_meta:', error)
        throw error
    }
    return data
}

// Only refreshes volatile stats — never touches manually managed fields like related_anime_source_ids
const refreshAnimeStats = async (serviceClient, sourceId, scraped) => {
    const { score, votes } = normalizeUserRating(scraped.userRating)
    const { data, error } = await serviceClient
        .from('anime_meta')
        .update({ views: parseViews(scraped.views), score, votes })
        .eq('source_id', sourceId)
        .select('*')
        .single()
    if (error) {
        console.error('Error refreshing anime stats:', error)
        throw error
    }
    return data
}

const buildAnimeMetaPayload = (scraped) => {
    const { score, votes } = normalizeUserRating(scraped.userRating)
    return {
        title: scraped.title,
        description: scraped.description,
        thumbnail: scraped.image,
        premiere_date: parsePremiereDate(scraped.premiereDate),
        director: scraped.director,
        distributor: scraped.distributor,
        production_company: scraped.productionCompany,
        tags: scraped.tags || [],
        views: parseViews(scraped.views),
        score,
        votes,
        related_anime_source_ids: (scraped.relatedAnime || []).map((a) => a.refId).filter(Boolean),
        source_id: scraped.refId,
        source_details_id: scraped.detailId,
        video_id: scraped.videoId || null,
        season: scraped.season || null,
    }
}

const scrapeAndUpsertAnime = async (serviceClient, refId) => {
    const scraped = await scrapeAnimeDetailByRefId(refId)
    if (!scraped) return null
    return upsertAnimeMeta(serviceClient, buildAnimeMetaPayload(scraped))
}

const fetchOrScrapeRelatedAnime = async (client, serviceClient, relatedRefIds) => {
    if (!relatedRefIds?.length) return []

    const existingMap = await batchFetchAnimeMeta(client, relatedRefIds)
    const missingIds = relatedRefIds.filter((id) => !existingMap.has(id))

    if (missingIds.length > 0) {
        await Promise.allSettled(
            missingIds.map(async (refId) => {
                try {
                    const anime = await scrapeAndUpsertAnime(serviceClient, refId)
                    if (anime) existingMap.set(anime.source_id, anime)
                } catch (err) {
                    // Handle race condition: another request inserted it first
                    if (err.code === '23505' || err.message?.includes('duplicate')) {
                        const { data } = await client.from('anime_meta').select('*').eq('source_id', refId).single()
                        if (data) existingMap.set(data.source_id, data)
                    } else {
                        console.error(`Error scraping related anime ${refId}:`, err)
                    }
                }
            }),
        )
    }

    return relatedRefIds.map((id) => existingMap.get(id)).filter(Boolean)
}

// ============================================================================
// Response Builder
// ============================================================================

const buildAnimeResponse = (meta, episodes, relatedAnime, isFavorite) => ({
    refId: meta.source_id,
    detailId: meta.source_details_id,
    title: meta.title,
    description: meta.description,
    views: meta.views,
    episodes,
    image: meta.thumbnail,
    premiereDate: meta.premiere_date,
    director: meta.director,
    distributor: meta.distributor,
    productionCompany: meta.production_company,
    tags: meta.tags || [],
    userRating: normalizeUserRating({ score: meta.score, votes: meta.votes }),
    relatedAnime: relatedAnime.map((a) => ({
        refId: a.source_id,
        title: a.title,
        image: a.thumbnail,
        year: a.premiere_date?.split('-')[0] || null,
        views: a.views,
    })),
    videoId: meta.video_id,
    season: meta.season,
    isFavorite,
})

// ============================================================================
// Main Handler
// ============================================================================

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const serviceClient = await serverSupabaseServiceRole(event)
    const refId = getRouterParam(event, 'refId')
    const { withEpisodes } = getQuery(event)

    try {
        // 1. Fetch cached metadata
        const metaMap = await batchFetchAnimeMeta(client, [refId])
        let meta = metaMap.get(refId)

        if (!meta) {
            // 2a. Not cached — scrape and insert
            const scraped = await scrapeAnimeDetailByRefId(refId)
            if (!scraped) throw createError({ statusCode: 404, statusMessage: 'Anime not found' })
            meta = await upsertAnimeMeta(serviceClient, buildAnimeMetaPayload(scraped))
        } else if (isStale(meta) && Number(meta.source_id) < 1000000) {
            // 2b. Stale — only refresh volatile stats, never overwrite manually managed fields
            try {
                const scraped = await scrapeAnimeDetailByRefId(refId)
                if (scraped) {
                    meta = await refreshAnimeStats(serviceClient, refId, scraped)
                } else {
                    console.error(`Stale refresh returned empty scrape for refId ${refId}; using cached metadata`)
                }
            } catch (err) {
                console.error(`Stale refresh failed for refId ${refId}; using cached metadata`, err)
            }
        }

        // 3. Parallel fetch: episodes (conditional), related anime, favorite status
        const [episodesData, relatedAnimeMeta, isFavorite] = await Promise.all([
            withEpisodes && meta.video_id ? fetchEpisodeTokens(meta.video_id) : Promise.resolve({ episodes: {} }),
            fetchOrScrapeRelatedAnime(client, serviceClient, meta.related_anime_source_ids || []),
            client
                .from('favorites')
                .select('id')
                .eq('anime_ref_id', refId)
                .eq('user_id', user.sub)
                .maybeSingle()
                .then(({ data }) => !!data),
        ])

        return buildAnimeResponse(meta, episodesData.episodes, relatedAnimeMeta, isFavorite)
    } catch (err) {
        console.error('Error in anime/[refId] handler:', err)
        throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    }
})
