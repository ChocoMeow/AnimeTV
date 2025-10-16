import * as cheerio from "cheerio"
import { matchAnime } from "~~/server/utils/anime.js"
import { GAMER_BASE_URL } from "~~/server/utils/global.js"

// Nuxt API handler
export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    
    try {
        const query = getQuery(event)
        const page = query.page || 1
        const tags = query.tags ? query.tags.split(",") : []
        const categories = query.categories ? query.categories.split(",") : []

        const params = new URLSearchParams({ page })
        if (tags.length) params.set("tags", tags.join(","))
        if (categories.length) params.set("c", categories.join(","))

        const url = `${GAMER_BASE_URL}animeList.php?${params.toString()}`
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
                    year: getText(movie, ".theme-time")?.replace("年份：", ""),
                    episodes: getText(movie, ".theme-number"),
                    views: getText(movie, ".show-view-number p"),
                }
            })
            .get()

        const results = await matchAnime(animeList)
        const totalPage = $(".page_number a:last-child").text().trim() || "1"

        return { results, totalPage }
    } catch (err) {
        console.error("Error scraping anime list:", err.message)
        return { results: [], totalPage: "0" }
    }
})
