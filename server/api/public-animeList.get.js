import * as cheerio from "cheerio"

// Cache for public anime list (first page only)
const PUBLIC_ANIME_LIST_CACHE = {
    fetchPromise: null,
    timestamp: 0,
    data: null
}

const CACHE_LIFETIME = 1000 * 60 * 12 // 12 hours

// Public API handler - no authentication required
// Limited to first page only, no query parameters allowed
export default defineEventHandler(async (event) => {
    const currentTime = Date.now()

    // Check cache first
    if (PUBLIC_ANIME_LIST_CACHE.data && (currentTime - PUBLIC_ANIME_LIST_CACHE.timestamp < CACHE_LIFETIME)) {
        return PUBLIC_ANIME_LIST_CACHE.data
    }

    // Wait for any ongoing fetch if it exists
    if (PUBLIC_ANIME_LIST_CACHE.fetchPromise) {
        return PUBLIC_ANIME_LIST_CACHE.fetchPromise
    }

    // Start a new fetch and cache the promise
    PUBLIC_ANIME_LIST_CACHE.fetchPromise = (async () => {
        try {
            // Always fetch first page only, no query parameters
            const url = `${GAMER_BASE_URL}animeList.php?page=1`
            const { html } = await cfFetch(url)
            const $ = cheerio.load(html)

            const getText = (el, selector) => $(el).find(selector).text().trim() || null
            const getAttr = (el, selector, attr) => $(el).find(selector).attr(attr)?.trim() || null

            const animeList = $(".theme-list-block .theme-list-main")
                .map((_, movie) => {
                    const href = $(movie).attr("href") || ""
                    const refId = href.match(/sn=(\d+)/)?.[1] || null

                    return {
                        refId,
                        image: getAttr(movie, ".theme-img", "data-src"),
                        title: getText(movie, ".theme-name"),
                    }
                })
                .get()

            // For public API, we return the raw scraped data without matching
            // This is sufficient for display purposes (like login page backgrounds)
            const results = animeList.filter(anime => anime.image && anime.title)
            const response = { results }

            // Cache the result
            PUBLIC_ANIME_LIST_CACHE.data = response
            PUBLIC_ANIME_LIST_CACHE.timestamp = currentTime
            PUBLIC_ANIME_LIST_CACHE.fetchPromise = null

            return response
        } catch (err) {
            console.error("Error scraping anime list (public):", err.message)
            PUBLIC_ANIME_LIST_CACHE.fetchPromise = null // Reset on error to allow retries
            return { results: [], totalPage: "0" }
        }
    })()

    return PUBLIC_ANIME_LIST_CACHE.fetchPromise
})

