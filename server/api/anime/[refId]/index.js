import * as cheerio from "cheerio"
import { serverSupabaseClient, serverSupabaseServiceRole } from "#supabase/server"

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
    if (!userRating) return { score: 0.0, votes: 0 }
    
    const rawScore = Number(userRating.score ?? 0)
    const numericScore = Number.isNaN(rawScore) ? 0 : rawScore
    // Ensure score is a decimal number (one decimal place)
    const score = parseFloat(numericScore.toFixed(1))
    
    const votes = Number(String(userRating.votes ?? 0).replace(/[^\d]/g, "")) || 0
    
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
    
    const lastMatch = matches[matches.length - 1]
    return lastMatch.slice(1, -1) // Remove [ and ]
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

const processEpisodeArticle = ($, element, nextPageUrl, episodes) => {
    const fullTitle = $(element).find("h2.entry-title a").text().trim()
    const token = $(element).find(".video-js").attr("data-apireq")
    
    if (!fullTitle || !token) {
        console.warn(`Skipping article on ${nextPageUrl}: Missing title or token`)
        return
    }
    
    const identifier = extractEpisodeIdentifier(fullTitle)
    if (!identifier) {
        console.warn(`Skipping article on ${nextPageUrl}: No episode identifier in "${fullTitle}"`)
        return
    }
    
    // Handle combined episodes (e.g., "1+2")
    identifier.split("+").forEach(episodeId => {
        const episodeKey = normalizeEpisodeId(episodeId.trim())
        
        if (episodes[episodeKey] && episodes[episodeKey] !== token) {
            console.warn(`Conflict for episode ${episodeKey}:`, { 
                oldToken: episodes[episodeKey], 
                newToken: token, 
                title: fullTitle 
            })
        }
        
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
            
            $("article").each((_, element) => {
                processEpisodeArticle($, element, nextPageUrl, episodes)
            })
            
            nextPageUrl = $(".nav-previous a").attr("href") || null
        }
        
        return { categoryId, title: seriesTitle, episodes }
    } catch (error) {
        console.error(`Error fetching episode data for category ${categoryId}:`, error)
        return { categoryId, title: seriesTitle, episodes }
    }
}

async function scrapeAnimeDetailByRefId(refId) {
    if (!isValidNumberString(refId)) {
        throw new Error(`Invalid reference ID: "${refId}" is not a valid number.`)
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
        
        const relatedAnime = await matchAnime(rawRelatedAnime)
        const premiereDate = get(".type-list li:nth-child(1) .content")
        const matchedVideo = await matchAnime([{ refId, title, year: premiereDate }])
            .then((results) => results[0].matchedVideo)
        
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
                votes: get(".score-overall-people")?.replace("人評價", "") || null,
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
// Database Operations
// ============================================================================

const fetchAnimeMeta = async (client, refId) => {
    const { data, error } = await client
        .from("anime_meta")
        .select("*")
        .eq("source_id", refId)
        .maybeSingle()
    
    if (error) console.error("Error fetching anime_meta:", error)
    return data
}

const insertAnimeMeta = async (serviceClient, payload) => {
    const { data, error } = await serviceClient
        .from("anime_meta")
        .insert(payload)
        .select("*")
        .single()
    
    if (error) {
        console.error("Error inserting anime_meta:", error)
        throw error
    }
    
    return data
}

const scrapeAndInsertAnime = async (serviceClient, refId) => {
    const scraped = await scrapeAnimeDetailByRefId(refId)
    if (!scraped) return null
    
    const payload = buildAnimeMetaPayload(scraped)
    return await insertAnimeMeta(serviceClient, payload)
}

const fetchOrCacheRelatedAnime = async (client, serviceClient, relatedRefIds) => {
    if (!relatedRefIds?.length) return []
    
    // Batch fetch all related anime from database first
    const { data: existingAnime } = await client
        .from("anime_meta")
        .select("*")
        .in("source_id", relatedRefIds)
    
    const existingMap = new Map((existingAnime || []).map(anime => [anime.source_id, anime]))
    const missingIds = relatedRefIds.filter(id => !existingMap.has(id))
    
    // Only scrape and insert missing anime
    if (missingIds.length > 0) {
        const newAnimeResults = await Promise.allSettled(
            missingIds.map(async (refId) => {
                try {
                    const newAnime = await scrapeAndInsertAnime(serviceClient, refId)
                    if (newAnime) existingMap.set(newAnime.source_id, newAnime)
                    return newAnime
                } catch (error) {
                    console.error(`Error caching related anime ${refId}:`, error)
                    return null
                }
            })
        )
    }
    
    // Return all related anime in the original order
    return relatedRefIds
        .map(id => existingMap.get(id))
        .filter(Boolean)
}

const checkFavorite = async (client, refId, userId) => {
    const { data } = await client
        .from("favorites")
        .select("id")
        .eq("anime_ref_id", refId)
        .eq("user_id", userId)
        .maybeSingle()
    
    return !!data
}

// ============================================================================
// Main Handler
// ============================================================================

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const serviceClient = await serverSupabaseServiceRole(event)
    const refId = getRouterParam(event, "refId")
    const query = getQuery(event)
    
    try {
        let meta = await fetchAnimeMeta(client, refId)
        
        if (!meta) {
            const scraped = await scrapeAnimeDetailByRefId(refId)
            if (!scraped) {
                throw createError({ statusCode: 404, statusMessage: "Anime not found" })
            }
            
            const payload = buildAnimeMetaPayload(scraped)
            meta = await insertAnimeMeta(serviceClient, payload)
        }
        
        // Fetch related anime (from DB if cached, or scrape and insert if missing)
        const relatedAnimeMeta = await fetchOrCacheRelatedAnime(
            client, 
            serviceClient, 
            meta.related_anime_source_ids || []
        )
        
        // Control whether to load episodes via query param (?withEpisodes=1 / true)
        const shouldLoadEpisodes =
            String(query.withEpisodes ?? "").toLowerCase() === "true"

        const [episodes, isFavorite] = await Promise.all([
            shouldLoadEpisodes && meta.video_id ? fetchEpisodeTokens(meta.video_id).then(d => d.episodes) : {},
            checkFavorite(client, refId, user.sub),
        ])
        
        // Format related anime to match expected structure
        const relatedAnime = relatedAnimeMeta.map(anime => ({
            refId: anime.source_id,
            title: anime.title,
            image: anime.thumbnail,
            year: anime.premiere_date?.split('-')[0] || null,
            views: anime.views,
        }))
        
        return {
            refId,
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
            userRating: meta.user_rating,
            relatedAnime,
            videoId: meta.video_id,
            season: meta.season,
            isFavorite,
        }
    } catch (error) {
        console.error("Error in anime/[refId] handler:", error)
        throw createError({ statusCode: 500, statusMessage: "Internal Server Error" })
    }
})