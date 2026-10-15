import { serverSupabaseClient, serverSupabaseServiceRole } from '#supabase/server'
import { CUSTOM_SOURCE_ID_MIN } from '#shared/utils/global'
import {
    buildAnimeMetaPayload,
    normalizeUserRating,
    scrapeAnimeDetailByRefId,
} from '~~/server/utils/scrapeAnimeMeta'
import { parseViews } from '~~/server/utils/functions'
import { getRequestLogger, moduleLogger } from '~~/server/utils/logger'

const log = moduleLogger('anime-detail')
const ONE_MONTH_MS = 1000 * 60 * 60 * 24 * 30

const isStale = (meta) => {
    const ms = new Date(meta?.updated_at).getTime()
    return !isNaN(ms) && Date.now() - ms > ONE_MONTH_MS
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
        log.error({ err: error }, 'Error upserting anime_meta')
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
    if (error) log.error({ err: error, sourceId }, 'Error refreshing anime stats')
    return data
}

// Fetch all related anime in a single query. Any missing entries are scraped after the response via waitUntil.
const fetchRelatedAnime = async (client, serviceClient, ids, event) => {
    if (!ids?.length) return []

    const { data } = await client.from('anime_meta').select('*').in('source_id', ids)
    const found = data || []

    const foundIds = new Set(found.map((a) => String(a.source_id)))
    const missing = ids.filter((id) => !foundIds.has(String(id)))

    if (missing.length) {
        const reqLog = getRequestLogger(event)
        event.waitUntil(
            Promise.allSettled(
                missing.map(async (refId) => {
                    try {
                        const scraped = await scrapeAnimeDetailByRefId(refId)
                        if (!scraped) return
                        await upsertAnimeMeta(serviceClient, buildAnimeMetaPayload(scraped))
                    } catch (err) {
                        if (!err.code?.includes('23505') && !err.message?.includes('duplicate')) {
                            reqLog.error({ err, refId }, 'Background scrape failed for related anime')
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
    relatedAnime: [...relatedAnime]
        .sort((a, b) => String(b.premiere_date || '').localeCompare(a.premiere_date || ''))
        .map((a) => ({
            refId: a.source_id,
            title: a.title,
            image: a.thumbnail,
            premiereDate: a.premiere_date || null,
            views: a.views,
            score: a.score != null && Number(a.score) > 0 ? Number(a.score) : null,
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
    const reqLog = getRequestLogger(event)

    // 1. Fetch cached meta — only blocks here on a true first-ever miss
    let meta = await fetchMeta(client, refId, user.sub)
    let isFavorite = meta?.isFavorite ?? false

    if (!meta) {
        const scraped = await scrapeAnimeDetailByRefId(refId)
        if (!scraped) throw createError({ statusCode: 404, statusMessage: 'Anime not found' })
        meta = await upsertAnimeMeta(serviceClient, buildAnimeMetaPayload(scraped))
    } else if (isStale(meta) && Number(meta.source_id) < CUSTOM_SOURCE_ID_MIN) {
        // Stale-while-revalidate: serve cached data now, refresh stats after response is sent
        event.waitUntil(
            scrapeAnimeDetailByRefId(refId)
                .then((scraped) => scraped && refreshAnimeStats(serviceClient, refId, scraped, meta.related_anime_source_ids))
                .catch((err) => reqLog.error({ err, refId }, 'Background refresh failed'))
        )
    }

    // 2. Fetch related anime from DB (fast indexed query), scrape any missing entries after response
    const relatedAnime = withRelated ? await fetchRelatedAnime(client, serviceClient, meta.related_anime_source_ids, event) : []

    setHeader(event, 'Cache-Control', 'public, max-age=60, stale-while-revalidate=300')
    return buildAnimeResponse(meta, relatedAnime, isFavorite)
})
