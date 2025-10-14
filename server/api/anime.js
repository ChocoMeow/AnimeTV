import * as cheerio from "cheerio"
import { searchAnimeTitle, matchAnime, cfFetch } from "~~/server/utils/anime.js"
import { GAMER_BASE_URL, ANIME1_BASE_URL, CHINESE_WEEKDAY_MAP, ANIME_CACHE } from "~~/server/utils/global.js"

/* Helper: extract date label text for a .newanime-date-area element */
function extractDateLabel($, $el) {
    let dateLabel = $el.find(".anime-date-info").first().text()
    if (!dateLabel || !dateLabel.trim()) {
        dateLabel =
            $el.children(".anime-date-info").first().text() ||
            $el.find(".anime-date-info-block-arrow").first().text() ||
            $el.find(".anime-date-info-block-rectangle").first().text() ||
            $el.nextAll(".anime-date-info").first().text() ||
            $el.parent().find(".anime-date-info").first().text() ||
            ""
    }
    return (dateLabel || "").trim()
}

/* Helper: given dateLabel and element attrs, resolve weekday numeric code string */
function resolveDayCode(dateLabel, $el) {
    const dateMatch = dateLabel.match(/(\d{1,2}\s*\/\s*\d{1,2})(?:\s*[\uFF08(]\s*([一二三四五六日])\s*[\uFF09)])?/)
    const dayChar = dateMatch && dateMatch[2] ? dateMatch[2] : null

    if (dayChar && CHINESE_WEEKDAY_MAP[dayChar]) return CHINESE_WEEKDAY_MAP[dayChar]

    const dataDateCode = $el.attr("data-date-code")
    if (dataDateCode) return String(dataDateCode)

    return null
}

/* Helper: safely get text/attr */
const getText = ($, el, selector) => $(el).find(selector).text().trim() || null
const getAttr = ($, el, selector, attr) => $(el).find(selector).attr(attr)?.trim() || null

/* Scrape anime blocks synchronously from loaded cheerio $ */
function scrapeAnimeBlocks($) {
    const items = []
    $(".newanime-date-area").each((_, el) => {
        const $el = $(el)
        const dateLabel = extractDateLabel($, $el)
        const dayCode = resolveDayCode(dateLabel, $el)
        const refId = getAttr($, $el, ".anime-card-block", "href")?.match(/sn=(\d+)/)?.[1] || null
        if (!dayCode) return // skip if can't resolve day

        const title = getText($, $el, ".anime-name")
        const episode = getText($, $el, ".anime-episode p")
        const thumbnail = getAttr($, $el, ".anime-blocker img", "data-src") || getAttr($, $el, ".anime-blocker img", "src") || null

        if (!title || !refId || !thumbnail) return

        items.push({
            dayCode,
            refId,
            title,
            episode,
            thumbnail,
        })
    })
    return items
}

async function scrapeThemesAndMatch($) {
    const themes = {}

    const getText = ($, el, sel) => $(el).find(sel).text().trim() || null
    const getAttr = ($, el, sel, attr) => $(el).find(sel).attr(attr)?.trim() || null

    // Select theme containers that themselves have the allowed ids AND the animate-theme-list class
    const selector = ["#blockHotAnime.animate-theme-list", "#blockAnimeNewArrive.animate-theme-list", '[id^="blockAnimeNewArrive-"].animate-theme-list'].join(", ")

    const themeEls = $(selector).toArray()

    if (!themeEls.length) {
        console.warn("No theme elements found with selector:", selector)
    }

    // Extract raw lists and run matchAnime for each non-empty list
    for (let i = 0; i < themeEls.length; i++) {
        const el = themeEls[i]
        const $el = $(el)
        const themeTitle = $el.find(".theme-title").text().trim() || $el.attr("id") || `unknown-${i}`

        // Try multiple likely item selectors
        const itemSelectors = [".theme-list-block", ".theme-list .theme-list-block", ".theme-item", ".theme-list-item", ".theme-list a", ".theme-list-block a"]
        let $items = $el.find(itemSelectors.join(", "))

        // fallback: check nearby nodes inside the same parent if nothing found inside this container
        if ($items.length === 0) {
            $items = $el.nextAll().find(itemSelectors.join(", "))
        }
        if ($items.length === 0) {
            $items = $el.parent().find(itemSelectors.join(", "))
        }

        const rawList = $items
            .map((_, movie) => {
                const href = $(movie).attr("href") || $(movie).find("a").attr("href") || ""
                const refId = href.match(/sn=(\d+)/)?.[1] || null
                return {
                    refId,
                    image: getAttr($, movie, ".theme-img", "data-src"),
                    title: getText($, movie, ".theme-name"),
                    year: getText($, movie, ".theme-time")?.replace("年份：", "") || null,
                    episodes: getText($, movie, ".theme-number"),
                    views: getText($, movie, ".show-view-number p"),
                }
            })
            .get()

        if (!rawList.length) {
            console.warn(`Theme "${themeTitle}" produced empty rawList. Container HTML (truncated):\n`, $el.html().slice(0, 800))
            themes[themeTitle] = [] // keep shape consistent with empty match
            continue
        }

        try {
            const matched = await matchAnime(rawList)
            themes[themeTitle] = Array.isArray(matched) ? matched : []
        } catch (err) {
            console.error("Error matching theme list for", themeTitle, err)
            themes[themeTitle] = []
        }
    }

    return themes
}

/* Optionally: perform title search to confirm existence for scraped items
   and return only matched items. You can tune concurrencyLimit if needed. */
async function filterScrapedItemsBySearch(scrapedItems, concurrencyLimit = 8) {
    // Run searches with limited concurrency to avoid hammering searchAnimeTitle's backend.
    // We'll implement a simple concurrency loop instead of a complex helper to keep it reliable.
    const results = []
    const queue = [...scrapedItems]
    const workers = new Array(Math.min(concurrencyLimit, queue.length)).fill(null).map(async () => {
        while (queue.length) {
            const item = queue.shift()
            try {
                const searchResult = await searchAnimeTitle(item.title)
                const hasResults = Array.isArray(searchResult) && searchResult.length > 0
                if (hasResults) {
                    // Optionally you can attach searchResult or matchedVideo here
                    results.push(item)
                } else {
                    // skip items with no search results
                }
            } catch (err) {
                console.error("Error searching title:", item.title, err)
            }
        }
    })

    await Promise.all(workers)
    return results
}

/* Main handler */
async function scrapeAllAnime() {
    const TWO_HOURS = 1000 * 60 * 60 * 2
    const now = Date.now()

    if (ANIME_CACHE.data && now - ANIME_CACHE.timestamp < TWO_HOURS) {
        return ANIME_CACHE.data
    }

    console.log("Fetching new data from anime source...")
    const { html } = await cfFetch(GAMER_BASE_URL)
    const $ = cheerio.load(html)

    const scrapedItems = scrapeAnimeBlocks($)
    const validatedItems = await filterScrapedItemsBySearch(scrapedItems)

    const byDay = {}
    for (const item of validatedItems) {
        const { dayCode, searchResult, ...payload } = item
        if (!byDay[dayCode]) byDay[dayCode] = []
        byDay[dayCode].push({ ...payload, searchResult })
    }

    const themes = await scrapeThemesAndMatch($)
    const result = {
        byDay,
        themes,
        fetchedAt: new Date(now).toISOString(),
    }

    ANIME_CACHE.timestamp = now
    ANIME_CACHE.data = result
    return result
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
                seriesTitle = $(".page-title").text().trim()
            }

            $("article").each((index, element) => {
                const fullTitle = $(element).find("h2.entry-title a").text().trim()
                const match = fullTitle.match(/\[(\d+)\]/)
                const token = $(element).find(".video-js").attr("data-apireq")
                if (match && token) {
                    episodes[String(Number(match[1]))] = token
                }
            })

            const prevLink = $(".nav-previous a").attr("href")
            nextPageUrl = prevLink ? prevLink : null
        }
        return {
            categoryId,
            title: seriesTitle,
            episodes,
        }
    } catch (error) {
        console.error("Error fetching or parsing episode data:", error)
        return {
            categoryId,
            title: seriesTitle,
            episodes,
        }
    }
}

async function scrapeAnimeDetailByVideoId(videoId) {
    try {
        const { html } = await cfFetch(`${GAMER_BASE_URL}animeVideo.php?sn=${videoId}`)
        const $ = cheerio.load(html)

        const getText = (selector) => $(selector).text().trim() || null
        const getAttr = (selector, attr) => $(selector).attr(attr)?.trim() || null

        const title = getText(".anime-title .anime_name h1")
        const description = getText(".data .data-intro p")
        const views = getText(".anime-title .anime_name .newanime-count span")
        const image = getAttr(".data .data-img", "data-src")
        const premiereDate = getText(".type-list li:nth-child(1) .content")
        const director = getText(".type-list li:nth-child(2) .content")
        const distributor = getText(".type-list li:nth-child(3) .content")
        const productionCompany = getText(".type-list li:nth-child(4) .content")
        const userRating = {
            score: getText(".score-overall-number"),
            count: getText(".score-overall-people")?.replace("人評價", "") || null,
        }

        const tags = $(".type-list .tag-list li")
            .map((_, tag) => $(tag).text().trim())
            .get()

        const rawRelatedAnime = $(".old_list .anime_slider .theme-list-main")
            .map((_, movie) => {
                const $movie = $(movie)
                const href = $movie.attr("href") || ""
                const refId = href.match(/sn=(\d+)/)?.[1] || null

                return {
                    refId,
                    image: $movie.find(".theme-img").attr("data-src")?.trim() || null,
                    title: $movie.find(".theme-name").text().trim() || null,
                    year: $movie.find(".theme-time").text().trim() || null,
                    episodes: $movie.find(".theme-number").text().trim() || null,
                    views: $movie.find(".show-view-number p").text().trim() || null,
                }
            })
            .get()
        const relatedAnime = await matchAnime(rawRelatedAnime)

        // Match anime to get video details
        if (!title) {
            console.error("No title found, cannot match anime")
            return null
        }

        const matchedVideo = await matchAnime([{ title, refId: videoId, year: premiereDate }]).then((results) => results[0].matchedVideo)
        const episodes = await fetchEpisodeTokens(matchedVideo.id).then((data) => data.episodes)

        return {
            id: videoId,
            title: matchedVideo.title,
            description,
            views,
            episodes,
            image,
            premiereDate,
            director,
            distributor,
            productionCompany,
            tags,
            userRating,
            relatedAnime,
        }
    } catch (err) {
        console.error("Error scraping anime video detail:", err.message, err.stack)
        return null
    }
}

async function scrapeAnimeDetailByRefId(refId) {
    try {
        // Fetch the ref page to get the actual video ID
        const { html } = await cfFetch(`${GAMER_BASE_URL}animeRef.php?sn=${refId}`)

        // The page might redirect or contain the video ID
        // Try to find video ID in the HTML
        const videoIdMatch = html?.match(/animeVideo\.php\?sn=(\d+)/)
        const videoId = videoIdMatch?.[1]

        if (!videoId) {
            console.error("Could not extract video ID from refId:", refId)
            return null
        }

        return await scrapeAnimeDetailByVideoId(videoId)
    } catch (err) {
        console.error("Error in scrapeAnimeDetailByRefId:", err.message)
        return null
    }
}

export default defineEventHandler(async (event) => {
    const { refId, videoId } = getQuery(event)

    try {
        let animeDetail = null

        if (refId) {
            animeDetail = await scrapeAnimeDetailByRefId(refId)
        } else if (videoId) {
            animeDetail = await scrapeAnimeDetailByVideoId(videoId)
        } else {
            return await scrapeAllAnime()
        }

        if (!animeDetail) {
            throw createError({ statusCode: 404, statusMessage: "Anime not found" })
        }

        return animeDetail
    } catch (error) {
        console.error("API error:", error)
        throw createError({ statusCode: 500, statusMessage: "Internal Server Error" })
    }
})