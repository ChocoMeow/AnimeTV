import * as cheerio from "cheerio"
import { serverSupabaseClient, serverSupabaseServiceRole } from "#supabase/server"

// ============================================================================
// Utility Functions
// ============================================================================

const parseViews = (viewsText) => {
    if (!viewsText) return 0
    const text = String(viewsText).trim()
    
    if (text.includes("萬")) {
        const numeric = Number(text.replace("萬", "").replace(/[^\d.]/g, ""))
        return Number.isNaN(numeric) ? 0 : Math.round(numeric * 10000)
    }
    
    const numeric = Number(text.replace(/[^\d]/g, ""))
    return Number.isNaN(numeric) ? 0 : numeric
}

const normalizeUserRating = (userRating) => {
    if (!userRating) return { score: '0.0', votes: 0 }
    
    const raw = Number(userRating.score ?? 0) || 0
    const score = (Math.round(raw * 10) / 10).toFixed(1)  // one decimal, e.g. 5 → '5.0'
    const votes = Number(String(userRating.count ?? userRating.votes ?? 0).replace(/[^\d]/g, "")) || 0
    
    return { score, votes }
}

const parsePremiereDate = (premiereDate) => {
    if (!premiereDate) return null
    
    const str = String(premiereDate)
    const isoMatch = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (isoMatch) return isoMatch[0]
    
    const slashMatch = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
    if (slashMatch) {
        const [, y, m, d] = slashMatch
        return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`
    }
    
    return null
}

const extractEpisodeIdentifier = (fullTitle) => {
    const matches = fullTitle.match(/\[([^\]]+)\]/g)
    if (!matches?.length) return null
    return matches[matches.length - 1].slice(1, -1)
}

const normalizeEpisodeId = (episodeId) => {
    return /^\d+$/.test(episodeId) ? String(Number(episodeId)) : episodeId
}

// ============================================================================
// Data Processing Functions
// ============================================================================

const buildAnimeMetaPayload = (scraped) => ({
    title: scraped.title,
    description: scraped.description,
    thumbnail: scraped.image,
    premiere_date: parsePremiereDate(scraped.premiereDate),
    director: scraped.director,
    distributor: scraped.distributor,
    production_company: scraped.productionCompany,
    tags: scraped.tags || [],
    views: parseViews(scraped.views),
    user_rating: normalizeUserRating(scraped.userRating),
    related_anime_source_ids: (scraped.relatedAnime || [])
        .map((item) => item.refId)
        .filter(Boolean),
    source_id: scraped.refId,
    source_details_id: scraped.detailId,
    video_id: scraped.videoId || null,
    season: scraped.season || null,
})

const processEpisodeArticle = ($, element, episodes) => {
    const fullTitle = $(element).find("h2.entry-title a").text().trim()
    const token = $(element).find(".video-js").attr("data-apireq")
    
    if (!fullTitle || !token) return
    
    const identifier = extractEpisodeIdentifier(fullTitle)
    if (!identifier) return
    
    identifier.split("+").forEach(episodeId => {
        const episodeKey = normalizeEpisodeId(episodeId.trim())
        episodes[episodeKey] = token
    })
}

async function fetchEpisodeTokens(categoryId) {
    const episodes = {}
    let seriesTitle = ""
    let nextPageUrl = `${ANIME1_BASE_URL}?cat=${categoryId}`
    
    try {
        while (nextPageUrl) {
            const { html } = await cfFetch(nextPageUrl)
            const $ = cheerio.load(html)
            
            if (!seriesTitle) {
                seriesTitle = $(".page-title").text().trim() || "Unknown Series"
            }
            
            $("article").each((_, element) => processEpisodeArticle($, element, episodes))
            nextPageUrl = $(".nav-previous a").attr("href") || null
        }
        
        return { categoryId, title: seriesTitle, episodes }
    } catch (error) {
        console.error(`Error fetching episodes for category ${categoryId}:`, error)
        return { categoryId, title: seriesTitle, episodes }
    }
}

async function scrapeAnimeDetailByRefId(refId) {
    if (!isValidNumberString(refId)) {
        throw new Error(`Invalid reference ID: "${refId}"`)
    }
    
    try {
        const { html } = await cfFetch(`${GAMER_BASE_URL}animeRef.php?sn=${refId}`)
        const $ = cheerio.load(html)
        
        const get = (selector, attr = null) => {
            const el = $(selector)
            return attr ? el.attr(attr)?.trim() || null : el.text().trim() || null
        }
        
        const title = get(".data-file img", "alt")
        if (!title) {
            console.error("No title found for refId:", refId)
            return null
        }
        
        const detailId = get(".data .data-intro .link-button", "href")?.match(/s=(\d+)/)?.[1] || null
        const premiereDate = get(".type-list li:nth-child(1) .content")
        
        const rawRelatedAnime = $(".old_list .anime_slider .theme-list-main")
            .map((_, movie) => {
                const $movie = $(movie)
                const href = $movie.attr("href") || ""
                
                return {
                    refId: href.match(/sn=(\d+)/)?.[1] || null,
                    image: $movie.find(".theme-img").attr("data-src")?.trim() || null,
                    title: $movie.find(".theme-name").text().trim() || null,
                    year: $movie.find(".theme-time").text().trim() || null,
                    episodes: $movie.find(".theme-number").text().trim() || null,
                    views: $movie.find(".show-view-number p").text().trim() || null,
                }
            })
            .get()
        
        const [relatedAnime, matchedVideo] = await Promise.all([
            matchAnime(rawRelatedAnime),
            matchAnime([{ refId, title, year: premiereDate }]).then(results => results[0].matchedVideo)
        ])
        
        return {
            refId,
            detailId,
            title,
            description: get(".data .data-intro p"),
            views: get(".anime-title .anime_name .newanime-count span"),
            image: get(".data .data-img", "data-src"),
            premiereDate,
            director: get(".type-list li:nth-child(2) .content"),
            distributor: get(".type-list li:nth-child(3) .content"),
            productionCompany: get(".type-list li:nth-child(4) .content"),
            tags: $(".type-list .tag-list li").map((_, tag) => $(tag).text().trim()).get(),
            userRating: {
                score: get(".score-overall-number"),
                count: get(".score-overall-people")?.replace("人評價", "") || null,
            },
            relatedAnime,
            videoId: matchedVideo.id,
            season: matchedVideo.season,
        }
    } catch (err) {
        console.error("Error scraping anime detail:", err.message)
        return null
    }
}

// ============================================================================
// Database Operations - Optimized with Batching
// ============================================================================

const batchFetchAnimeMeta = async (client, refIds) => {
    if (!refIds?.length) return new Map()
    
    const { data, error } = await client
        .from("anime_meta")
        .select("*")
        .in("source_id", refIds)
    
    if (error) console.error("Error batch fetching anime_meta:", error)
    return new Map((data || []).map(anime => [anime.source_id, anime]))
}

const upsertAnimeMeta = async (serviceClient, payload) => {
    const { data, error } = await serviceClient
        .from("anime_meta")
        .upsert(payload, { 
            onConflict: "source_id",
            ignoreDuplicates: false 
        })
        .select("*")
        .single()
    
    if (error) {
        console.error("Error upserting anime_meta:", error)
        throw error
    }
    
    return data
}

const scrapeAndUpsertAnime = async (serviceClient, refId) => {
    const scraped = await scrapeAnimeDetailByRefId(refId)
    if (!scraped) return null
    
    const payload = buildAnimeMetaPayload(scraped)
    return await upsertAnimeMeta(serviceClient, payload)
}

const fetchOrScrapeRelatedAnime = async (client, serviceClient, relatedRefIds) => {
    if (!relatedRefIds?.length) return []
    
    // Single batch query to fetch all existing related anime
    const existingMap = await batchFetchAnimeMeta(client, relatedRefIds)
    const missingIds = relatedRefIds.filter(id => !existingMap.has(id))
    
    // Scrape and insert only missing anime in parallel
    if (missingIds.length > 0) {
        const results = await Promise.allSettled(
            missingIds.map(async (refId) => {
                try {
                    const newAnime = await scrapeAndUpsertAnime(serviceClient, refId)
                    if (newAnime) existingMap.set(newAnime.source_id, newAnime)
                    return newAnime
                } catch (error) {
                    // Handle race condition: another request inserted it first
                    if (error.code === '23505' || error.message?.includes('duplicate')) {
                        const { data } = await client
                            .from("anime_meta")
                            .select("*")
                            .eq("source_id", refId)
                            .single()
                        
                        if (data) existingMap.set(data.source_id, data)
                        return data
                    }
                    console.error(`Error scraping related anime ${refId}:`, error)
                    return null
                }
            })
        )
    }
    
    // Return in original order, filtering out nulls
    return relatedRefIds.map(id => existingMap.get(id)).filter(Boolean)
}

const formatRelatedAnime = (relatedAnimeMeta) => 
    relatedAnimeMeta.map(anime => ({
        refId: anime.source_id,
        title: anime.title,
        image: anime.thumbnail,
        year: anime.premiere_date?.split('-')[0] || null,
        views: anime.views,
    }))

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
    userRating: normalizeUserRating(meta.user_rating),
    relatedAnime,
    videoId: meta.video_id,
    season: meta.season,
    isFavorite,
})

// ============================================================================
// Main Handler - Optimized Flow
// ============================================================================

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const serviceClient = await serverSupabaseServiceRole(event)
    const refId = getRouterParam(event, "refId")
    const query = getQuery(event)
    const withEpisodes = query.withEpisodes === 'true' || query.withEpisodes === true
    
    try {
        // Fetch main anime metadata
        const metaMap = await batchFetchAnimeMeta(client, [refId])
        let meta = metaMap.get(refId)
        
        // If not cached, scrape and insert
        if (!meta) {
            const scraped = await scrapeAnimeDetailByRefId(refId)
            if (!scraped) {
                throw createError({ statusCode: 404, statusMessage: "Anime not found" })
            }
            
            const payload = buildAnimeMetaPayload(scraped)
            meta = await upsertAnimeMeta(serviceClient, payload)
        }
        
        // Parallel execution: conditionally fetch episodes, related anime, and favorite status
        const [episodesData, relatedAnimeMeta, isFavorite] = await Promise.all([
            withEpisodes && meta.video_id 
                ? fetchEpisodeTokens(meta.video_id) 
                : Promise.resolve({ episodes: {} }),
            fetchOrScrapeRelatedAnime(client, serviceClient, meta.related_anime_source_ids || []),
            client
                .from("favorites")
                .select("id")
                .eq("anime_ref_id", refId)
                .eq("user_id", user.sub)
                .maybeSingle()
                .then(({ data }) => !!data)
        ])
        
        const relatedAnime = formatRelatedAnime(relatedAnimeMeta)
        
        return buildAnimeResponse(meta, episodesData.episodes, relatedAnime, isFavorite)
    } catch (error) {
        console.error("Error in anime/[refId] handler:", error)
        throw createError({ statusCode: 500, statusMessage: "Internal Server Error" })
    }
})