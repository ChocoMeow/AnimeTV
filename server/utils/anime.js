// Requires: npm install axios
// Requires: FlareSolverr running on http://localhost:8191
import axios from "axios"

// Cache variable
let cachedAnimeList = null
let fetchPromise = null

const FLARESOLVERR_URL = "http://localhost:8191/v1"

// FlareSolverr session management
let flaresolverrSession = null
let flaresolverrSessionPromise = null
let sessionCreatedAt = null
const SESSION_LIFETIME = 1000 * 60 * 120 // 120 minutes

// Response cache to avoid redundant requests
const responseCache = new Map()
const CACHE_LIFETIME = 1000 * 60 * 12 // 12 hours

async function getFlareSolverrSession() {
    const now = Date.now()

    // If already creating a session, wait for that promise
    if (flaresolverrSessionPromise) {
        return flaresolverrSessionPromise
    }

    // Reuse existing session if it's still valid
    if (flaresolverrSession && sessionCreatedAt && now - sessionCreatedAt < SESSION_LIFETIME) {
        return flaresolverrSession
    }

    // Create promise for new session
    flaresolverrSessionPromise = (async () => {
        // Destroy old session if exists
        if (flaresolverrSession) {
            try {
                await axios.post(FLARESOLVERR_URL, {
                    cmd: "sessions.destroy",
                    session: flaresolverrSession,
                })
            } catch (err) {
                console.log("Failed to destroy old session:", err.message)
            }
        }

        // Create new session
        try {
            const response = await axios.post(FLARESOLVERR_URL, {
                cmd: "sessions.create",
            })

            if (response.data.status === "ok") {
                flaresolverrSession = response.data.session
                sessionCreatedAt = now
                console.log("Created new FlareSolverr session:", flaresolverrSession)
                return flaresolverrSession
            }
        } catch (err) {
            console.error("Failed to create FlareSolverr session:", err.message)
        }

        return null
    })()

    const result = await flaresolverrSessionPromise
    flaresolverrSessionPromise = null // Clear promise after completion
    return result
}

function toChineseNumber(num) {
    const map = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
    const digits = String(num)
        .split("")
        .map((d) => map[+d])
    return digits.join("")
}

function normalizeTitle(str) {
    return str
        .replace(/\s*\[[^\]]*\]/g, "")
        .replace(/（/g, "(")
        .replace(/）/g, ")")
        .replace(/「|」/g, "")
        .replace(/！|。/g, "")
        .replace(/season\s*(\d+)/gi, (_, num) => `第${toChineseNumber(num)}季`)
        .replace(/\bs(\d+)\b/gi, (_, num) => `第${toChineseNumber(num)}季`)
        .replace(/\s*(\d+)\s*$/, (_, num) => ` 第${toChineseNumber(num)}季`)
        .replace(/[.,:;=\-\/?()'"!@#$%^&*_+[\]{}<>|`~‧·′'－．・～：]/g, "")
        .replace(/\s+/g, "")
        .trim()
        .toLowerCase()
}

export async function fetchAnimeData() {
    // If we already have data, return it immediately
    if (cachedAnimeList) return cachedAnimeList

    // If a fetch is already in progress, wait for it
    if (fetchPromise) return fetchPromise

    // Otherwise, start a new fetch and cache the promise
    fetchPromise = (async () => {
        try {
            console.log("Fetching anime data from source...")
            const response = await fetch("https://d1zquzjgwo9yb.cloudfront.net/")
            const rawList = await response.json()

            cachedAnimeList = rawList.map(([id, title, episodes, year, season, subtitleGroup]) => ({
                id,
                title,
                episodes,
                year,
                season,
                subtitleGroup,
            }))

            return cachedAnimeList
        } catch (error) {
            console.error("Error fetching anime data:", error)
            fetchPromise = null // Reset on error so it can be retried
            throw error
        }
    })()

    return fetchPromise
}

export async function searchAnimeTitle(query) {
    try {
        const animeList = await fetchAnimeData()
        const normalizedQuery = normalizeTitle(query)
        return animeList.filter((anime) => normalizeTitle(anime.title).includes(normalizedQuery))
    } catch (error) {
        console.error("Error searching anime title:", error)
        return []
    }
}

export async function matchAnime(animeList) {
    if (!Array.isArray(animeList) || animeList.length === 0) {
        console.warn("matchAnime called with empty or invalid animeList")
        return []
    }

    const results = await Promise.all(
        animeList.map(async (anime) => {
            try {
                const videoDetails = await searchAnimeTitle(anime.title)
                if (!videoDetails || videoDetails.length === 0) {
                    console.warn(`No search results for: ${anime.title}`)
                    return null
                }

                const premiereYear = anime.year?.split("/")?.[0]?.trim()
                let matchedVideo = videoDetails.find((v) => String(v.year) === String(premiereYear))

                if (!matchedVideo) {
                    matchedVideo = videoDetails[0]
                }

                return { ...anime, matchedVideo }
            } catch (err) {
                console.error(`Error matching anime: ${anime.title}`, err)
                return null
            }
        })
    )

    return results.filter(Boolean)
}

export async function cfFetch(url, options = {}) {
    const startTime = Date.now()
    const now = Date.now()
    const { method = "GET", body = null, headers = {}, postData = null } = options

    // Create cache key that includes method and body for POST requests
    const cacheKey = method === "POST" ? `${method}:${url}:${JSON.stringify(body || postData)}` : url

    // Check cache first (you may want to disable caching for POST requests)
    const cached = responseCache.get(cacheKey)
    if (cached && now - cached.timestamp < CACHE_LIFETIME) {
        console.log(`Cache hit for: ${url} (${cached.html.length} bytes)`)
        // Return the full cached object with cookies
        return {
            html: cached.html,
            cookies: cached.cookies || [],
            headers: cached.headers || {},
        }
    }

    try {
        // Get or create a session
        const session = await getFlareSolverrSession()
        console.log(`Fetching via FlareSolverr [${method}]: ${url}`)

        const requestData = {
            cmd: method === "POST" ? "request.post" : "request.get",
            url: url,
            maxTimeout: 60000,
        }

        // Add session if available
        if (session) {
            requestData.session = session
        }

        // Add POST data if provided
        if (method === "POST" && (body || postData)) {
            requestData.postData = postData || (typeof body === "string" ? body : JSON.stringify(body))
        }

        // Add custom headers if provided
        if (Object.keys(headers).length > 0) {
            requestData.headers = headers
        }

        const response = await axios.post(FLARESOLVERR_URL, requestData)
        if (response.data.status === "ok") {
            const html = response.data.solution.response
            const cookies = response.data.solution.cookies || []
            const responseHeaders = response.data.solution.headers || {}
            const duration = ((Date.now() - startTime) / 1000).toFixed(2)

            // Verify we didn't get a Cloudflare challenge page
            if (html.includes("系統異常回報") || html.includes("Just a moment")) {
                console.error("Still got Cloudflare challenge page")
                return null
            }

            // Cache the response WITH cookies
            responseCache.set(cacheKey, {
                html: html,
                cookies: cookies,
                headers: responseHeaders,
                timestamp: now,
            })

            // Clean old cache entries (keep cache size manageable)
            if (responseCache.size > 100) {
                const firstKey = responseCache.keys().next().value
                responseCache.delete(firstKey)
            }

            console.log(`Successfully fetched [${method}] in ${duration}s: ${url} (${html.length} bytes)`)

            // Return object with html, cookies, and headers
            return {
                html: html,
                cookies: cookies,
                headers: responseHeaders,
            }
        } else {
            console.error("FlareSolverr error:", response.data.message)
            return null
        }
    } catch (error) {
        const duration = ((Date.now() - startTime) / 1000).toFixed(2)
        console.error(`FlareSolverr request failed after ${duration}s:`, error.message)
        return null
    }
}
