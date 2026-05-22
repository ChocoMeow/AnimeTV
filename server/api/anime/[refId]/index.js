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
            tags: $('.type-list .tag-list li').map((_, tag) => $(tag).text().trim()).get(),
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

// ============================================================================
// Database
// ============================================================================

const fetchMeta = async (client, sourceId, userId) => {
    const { data } = await client
        .from('anime_meta')
        .select('*, favorites!left(id, user_id)')
        .eq('source_id', sourceId)
        .eq('favorites.user_id', userId)
        .single()
    if (!data) return null
    const isFavorite = Array.isArray(data.favorites) && data.favorites.length > 0
    delete data.favorites
    return { ...data, isFavorite }
}

const upsertAnimeMeta = async (serviceClient, payload) => {
    const { data, error } = await serviceClient
        .from('anime_meta')
        .upsert(payload, { onConflict: 'source_id', ignoreDuplicates: false })
        .select('*')
        .single()
    if (error) {
        console.error('Error upserting anime_meta:', error)
        throw error
    }
    return data
}

// Refreshes volatile stats; related ids = existing row (manual + prior) plus any new ref ids from scrape, never dropping extras
const refreshAnimeStats = async (serviceClient, sourceId, scraped, existingRelatedIds) => {
    const { score, votes } = normalizeUserRating(scraped.userRating)
    const fromDb = Array.isArray(existingRelatedIds) ? existingRelatedIds.filter(Boolean) : []
    const fromScrape = (scraped.relatedAnime || []).map((a) => a.refId).filter(Boolean)
    const related_anime_source_ids = [...new Set([...fromDb, ...fromScrape])]
    const { data, error } = await serviceClient
        .from('anime_meta')
        .update({
            views: parseViews(scraped.views),
            score,
            votes,
            updated_at: new Date().toISOString(),
            related_anime_source_ids,
        })
        .eq('source_id', sourceId)
        .select('*')
        .single()
    if (error) console.error('Error refreshing anime stats:', error)
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

// Fetch all related anime in a single query. Any missing entries are scraped after the response via waitUntil.
const fetchRelatedAnime = async (client, serviceClient, ids, event) => {
    if (!ids?.length) return []

    const { data } = await client.from('anime_meta').select('*').in('source_id', ids)
    const found = data || []

    const foundIds = new Set(found.map((a) => String(a.source_id)))
    const missing = ids.filter((id) => !foundIds.has(String(id)))

    if (missing.length) {
        event.waitUntil(
            Promise.allSettled(
                missing.map(async (refId) => {
                    try {
                        await upsertAnimeMeta(serviceClient, buildAnimeMetaPayload(await scrapeAnimeDetailByRefId(refId)))
                    } catch (err) {
                        if (!err.code?.includes('23505') && !err.message?.includes('duplicate')) {
                            console.error(`Background scrape failed for related anime ${refId}:`, err)
                        }
                    }
                }),
            )
        )
    }

    return found
}

// ============================================================================
// Response Builder
// ============================================================================

const buildAnimeResponse = (meta, relatedAnime, isFavorite) => ({
    refId: meta.source_id,
    detailId: meta.source_details_id,
    title: meta.title,
    description: meta.description,
    views: meta.views,
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
    const query = getQuery(event)
    const withRelated = query.withRelated === 'true'

    // 1. Fetch cached meta — only blocks here on a true first-ever miss
    let meta = await fetchMeta(client, refId, user.sub)
    let isFavorite = meta?.isFavorite ?? false

    if (!meta) {
        const scraped = await scrapeAnimeDetailByRefId(refId)
        if (!scraped) throw createError({ statusCode: 404, statusMessage: 'Anime not found' })
        meta = await upsertAnimeMeta(serviceClient, buildAnimeMetaPayload(scraped))
    } else if (isStale(meta) && Number(meta.source_id) < 1_000_000) {
        // Stale-while-revalidate: serve cached data now, refresh stats after response is sent
        event.waitUntil(
            scrapeAnimeDetailByRefId(refId)
                .then((scraped) => scraped && refreshAnimeStats(serviceClient, refId, scraped, meta.related_anime_source_ids))
                .catch((err) => console.error(`Background refresh failed for ${refId}:`, err))
        )
    }

    // 2. Fetch related anime from DB (fast indexed query), scrape any missing entries after response
    const relatedAnime = withRelated ? await fetchRelatedAnime(client, serviceClient, meta.related_anime_source_ids, event) : []

    setHeader(event, 'Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return buildAnimeResponse(meta, relatedAnime, isFavorite)
})