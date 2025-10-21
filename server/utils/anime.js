// Requires: npm install axios
// Requires: FlareSolverr running on http://localhost:8191
// import axios from "axios"

// const FLARESOLVERR_URL = "http://localhost:8191/v1"

// FlareSolverr session management
// let flaresolverrSession = null
// let flaresolverrSessionPromise = null
// let sessionCreatedAt = null
// const SESSION_LIFETIME = 1000 * 60 * 120 // 120 minutes

// Response cache to avoid redundant requests


// async function getFlareSolverrSession() {
//     const now = Date.now()

//     // If already creating a session, wait for that promise
//     if (flaresolverrSessionPromise) {
//         return flaresolverrSessionPromise
//     }

//     // Reuse existing session if it's still valid
//     if (flaresolverrSession && sessionCreatedAt && now - sessionCreatedAt < SESSION_LIFETIME) {
//         return flaresolverrSession
//     }

//     // Create promise for new session
//     flaresolverrSessionPromise = (async () => {
//         // Destroy old session if exists
//         if (flaresolverrSession) {
//             try {
//                 await axios.post(FLARESOLVERR_URL, {
//                     cmd: "sessions.destroy",
//                     session: flaresolverrSession,
//                 })
//             } catch (err) {
//                 console.log("Failed to destroy old session:", err.message)
//             }
//         }

//         // Create new session
//         try {
//             const response = await axios.post(FLARESOLVERR_URL, {
//                 cmd: "sessions.create",
//             })

//             if (response.data.status === "ok") {
//                 flaresolverrSession = response.data.session
//                 sessionCreatedAt = now
//                 console.log("Created new FlareSolverr session:", flaresolverrSession)
//                 return flaresolverrSession
//             }
//         } catch (err) {
//             console.error("Failed to create FlareSolverr session:", err.message)
//         }

//         return null
//     })()

//     const result = await flaresolverrSessionPromise
//     flaresolverrSessionPromise = null // Clear promise after completion
//     return result
// }

function toChineseNumber(num) {
    const map = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
    const digits = String(num)
        .split("")
        .map((d) => map[+d])
    return digits.join("")
}

function normalizeTitle(str) {
    return str
        .replace(/\s*\[[^\]]*\]/g, "") // Remove bracketed text
        .replace(/（/g, "(") // Normalize parentheses
        .replace(/）/g, ")")
        .replace(/「|」/g, "") // Remove quotes
        .replace(/！|。/g, "") // Remove punctuation
        .replace(/season\s*(\d+)/gi, (_, num) => `第${toChineseNumber(num)}季`) // Convert season
        .replace(/\bs(\d+)\b/gi, (_, num) => `第${toChineseNumber(num)}季`) // Convert short form season
        .replace(/\s*(\d+)\s*$/, (_, num) => ` 第${toChineseNumber(num)}季`) // Convert trailing numbers to season
        .replace(/\b(\w+)(s)\b/g, (match, word) => word) // Remove 's' from words if they end with 's'
        .replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, match => ROMAN_CHARACTERS[match])
        .replace(/[.,:;=\-\/?()'"!@#$%^&*_+[\]{}<>|`~‧·′'－．・～：’＆]/g, "") // Remove special characters
        .replace(/\s+/g, "") // Remove whitespace
        .trim() // Trim leading/trailing whitespace
        .toLowerCase(); // Convert to lowercase
}

export async function fetchAnimeData() {
    const currentTime = Date.now()

    if (ANIME1_LIST_CACHE.data && (currentTime - ANIME1_LIST_CACHE.timestamp < CACHE_LIFETIME)) {
        return ANIME1_LIST_CACHE.data
    }

    // Wait for any ongoing fetch if it exists
    if (ANIME1_LIST_CACHE.fetchPromise) return ANIME1_LIST_CACHE.fetchPromise;

    // Start a new fetch and cache the promise
    ANIME1_LIST_CACHE.fetchPromise = (async () => {
        try {
            console.log("Fetching anime data from source...");
            const response = await fetch("https://d1zquzjgwo9yb.cloudfront.net/");
            console.log()
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            const rawList = await response.json();
            ANIME1_LIST_CACHE.data = rawList.map(([id, title, episodes, year, season, subtitleGroup]) => ({
                id,
                title,
                episodes,
                year,
                season,
                subtitleGroup,
            }));

            ANIME1_LIST_CACHE.timestamp = currentTime;
            ANIME1_LIST_CACHE.fetchPromise = null;
            return ANIME1_LIST_CACHE.data;
        } catch (error) {
            console.error("Error fetching anime data:", error);
            ANIME1_LIST_CACHE.fetchPromise = null; // Reset on error to allow retries
            throw error;
        }
    })();

    return ANIME1_LIST_CACHE.fetchPromise;
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
        return []
    }

    const results = await Promise.all(
        animeList.map(async (anime) => {
            try {
                if (!anime.title || !anime.refId) {
                    return null;
                }

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

                return {
                    ...anime,
                    matchedVideo: {
                        id: matchedVideo.id,
                        year: matchedVideo.year,
                        season: matchedVideo.season
                    }
                }
            } catch (err) {
                console.error(`Error matching anime: ${anime.title}`, err)
                return null
            }
        })
    )

    return results.filter(Boolean)
}

export async function cfFetch(url) {
    try {
        const now = Date.now()

        const cached = RESPONSE_CACHE.get(url)
        if (cached && now - cached.timestamp < CACHE_LIFETIME) {
            console.log(`Cache hit for: ${url} (${cached.html.length} bytes)`)
            return cached
        }

        const response = await fetch(url)
        if (!response.ok) { throw new Error(`HTTP error! Status: ${response.status}}`) }

        const html = await response.text()
        const result = { html, timestamp: now }

        RESPONSE_CACHE.set(url, result)
        if (RESPONSE_CACHE.size > 200) {
            const firstKey = RESPONSE_CACHE.keys().next().value
            RESPONSE_CACHE.delete(firstKey)
        }

        return result
    } catch (error) {
        return null;
    }
}

// export async function cfFetch(url, options = {}) {
//     const startTime = Date.now()
//     const now = Date.now()
//     const { method = "GET", body = null, headers = {}, postData = null } = options

//     // Create cache key that includes method and body for POST requests
//     const cacheKey = method === "POST" ? `${method}:${url}:${JSON.stringify(body || postData)}` : url

//     // Check cache first (you may want to disable caching for POST requests)
//     const cached = RESPONSE_CACHE.get(cacheKey)
//     if (cached && now - cached.timestamp < CACHE_LIFETIME) {
//         console.log(`Cache hit for: ${url} (${cached.html.length} bytes)`)
//         // Return the full cached object with cookies
//         return {
//             html: cached.html,
//             cookies: cached.cookies || [],
//             headers: cached.headers || {},
//         }
//     }

//     try {
//         // Get or create a session
//         const session = await getFlareSolverrSession()
//         console.log(`Fetching via FlareSolverr [${method}]: ${url}`)

//         const requestData = {
//             cmd: method === "POST" ? "request.post" : "request.get",
//             url: url,
//             maxTimeout: 60000,
//         }

//         // Add session if available
//         if (session) {
//             requestData.session = session
//         }

//         // Add POST data if provided
//         if (method === "POST" && (body || postData)) {
//             requestData.postData = postData || (typeof body === "string" ? body : JSON.stringify(body))
//         }

//         // Add custom headers if provided
//         if (Object.keys(headers).length > 0) {
//             requestData.headers = headers
//         }

//         const response = await axios.post(FLARESOLVERR_URL, requestData)
//         if (response.data.status === "ok") {
//             const html = response.data.solution.response
//             const cookies = response.data.solution.cookies || []
//             const responseHeaders = response.data.solution.headers || {}
//             const duration = ((Date.now() - startTime) / 1000).toFixed(2)

//             // Verify we didn't get a Cloudflare challenge page
//             if (html.includes("系統異常回報") || html.includes("Just a moment")) {
//                 console.error("Still got Cloudflare challenge page")
//                 return null
//             }

//             // Cache the response WITH cookies
//             RESPONSE_CACHE.set(cacheKey, {
//                 html: html,
//                 cookies: cookies,
//                 headers: responseHeaders,
//                 timestamp: now,
//             })

//             // Clean old cache entries (keep cache size manageable)
//             if (RESPONSE_CACHE.size > 100) {
//                 const firstKey = RESPONSE_CACHE.keys().next().value
//                 RESPONSE_CACHE.delete(firstKey)
//             }

//             console.log(`Successfully fetched [${method}] in ${duration}s: ${url} (${html.length} bytes)`)

//             // Return object with html, cookies, and headers
//             return {
//                 html: html,
//                 cookies: cookies,
//                 headers: responseHeaders,
//             }
//         } else {
//             console.error("FlareSolverr error:", response.data.message)
//             return null
//         }
//     } catch (error) {
//         const duration = ((Date.now() - startTime) / 1000).toFixed(2)
//         console.error(`FlareSolverr request failed after ${duration}s:`, error.message)
//         return null
//     }
// }
