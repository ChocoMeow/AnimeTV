import * as cheerio from "cheerio"

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

/* Scrape anime blocks synchronously from loaded cheerio $ */
async function scrapeAnimeBlocksAndMatch($) {
    const items = []
    $(".newanime-date-area").each((_, el) => {
        const $el = $(el)

        const dateLabel = extractDateLabel($, $el)
        const dayCode = resolveDayCode(dateLabel, $el)
        if (!dayCode) return // skip if can't resolve day

        const getText = (selector) => $el.find(selector).text().trim() || null
        const getAttr = (selector, attr) => $el.find(selector).attr(attr)?.trim() || null

        const refId = $el.attr("data-animesn") || null
        const title = getText(".anime-name")
        const episode = getText(".anime-episode p")
        const thumbnail = getAttr(".anime-blocker img", "data-src") || getAttr(".anime-blocker img", "src") || null

        if (!refId || !title || !thumbnail) return

        items.push({
            refId,
            title,
            episode,
            thumbnail,
            dayCode,
        })
    })

    const matched = await matchAnime(items)

    const byDay = {}
    for (const item of matched) {
        const { dayCode, searchResult, ...payload } = item
        if (!byDay[dayCode]) byDay[dayCode] = []
        byDay[dayCode].push({ ...payload, searchResult })
    }
    return byDay
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
            continue
        }

        try {
            const matched = await matchAnime(rawList)
            themes[themeTitle] = Array.isArray(matched) ? matched : []
        } catch (err) {
            console.error("Error matching theme list for", themeTitle, err)
        }
    }

    return themes
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

    const byDay = await scrapeAnimeBlocksAndMatch($)
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

export default defineEventHandler(async (event) => {
    const user = await authUser(event)

    try {
        return await scrapeAllAnime()
    } catch (error) {
        console.error("API error:", error)
        throw createError({ statusCode: 500, statusMessage: "Internal Server Error" })
    }
})