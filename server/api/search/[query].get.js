import * as cheerio from "cheerio"

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    
    const { query } = event.context.params

    try {
        const url = `${GAMER_BASE_URL}search.php?keyword=${query}`
        const { html } = await cfFetch(url)
        const $ = cheerio.load(html)

        const getText = (el, selector) => $(el).find(selector).text().trim() || null
        const getAttr = (el, selector, attr) => $(el).find(selector).attr(attr)?.trim() || null

        const rawList = $(".animate-theme-list .theme-list-block .theme-list-main")
            .map((_, movie) => {
                const href = $(movie).attr("href") || ""
                const refId = href.match(/sn=(\d+)/)?.[1] || null

                return {
                    refId,
                    image: getAttr(movie, ".theme-img", "data-src"),
                    title: getText(movie, ".theme-name"),
                    year: getText(movie, ".theme-time")?.replace("年份：", ""),
                    episodes: getText(movie, ".theme-number"),
                    views: getText(movie, ".show-view-number p"),
                }
            })
            .get()

        if (!rawList || rawList.length === 0) {
            return { results: [] }
        }
        const results = await matchAnime(rawList)
        return { results }
    } catch (err) {
        console.error("Error scraping anime list:", err.message)
        return { results: [] }
    }
})
