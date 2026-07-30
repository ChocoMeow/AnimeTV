import * as cheerio from "cheerio"
import { serverSupabaseClient } from "#supabase/server"
import { logError } from "~~/server/utils/logger"

async function fetchManualAnime(event, { page, tags, sort }) {
    const pageNum = Math.max(1, Number(page) || 1)
    const from = (pageNum - 1) * 30
    const cleanTags = tags.filter(Boolean)

    let dbQuery = (await serverSupabaseClient(event))
        .from("anime_meta")
        .select("source_id, title, thumbnail, premiere_date, views", { count: "exact" })
        .gte("source_id", CUSTOM_SOURCE_ID_MIN)

    if (cleanTags.length) dbQuery = dbQuery.overlaps("tags", cleanTags)

    dbQuery = (sort === "2"
        ? dbQuery.order("views", { ascending: false, nullsFirst: false })
        : dbQuery.order("premiere_date", { ascending: false, nullsFirst: false })
    ).range(from, from + 29)

    const { data, error, count } = await dbQuery
    if (error) throw error

    return {
        results: (data || []).map((row) => ({
            refId: String(row.source_id),
            image: row.thumbnail,
            title: row.title,
            year: toYearMonthSlash(row.premiere_date),
            episodes: null,
            views: row.views ?? null,
        })),
        totalPage: String(Math.max(1, Math.ceil((count || 0) / 30))),
    }
}

// Nuxt API handler
export default defineEventHandler(async (event) => {
    await authUser(event)

    try {
        const query = getQuery(event)
        const page = query.page || 1
        const tags = query.tags ? query.tags.split(",") : []
        const categories = query.categories ? query.categories.split(",") : []
        const sort = query.sort || null

        if (query.category === "自訂作品") {
            return await fetchManualAnime(event, { page, tags, sort })
        }

        const params = new URLSearchParams({ page })
        if (tags.length) params.set("tags", tags.join(","))
        if (categories.length) params.set("c", categories.join(","))
        if (sort) params.set("sort", sort)

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
                    views: parseViews(getText(movie, ".show-view-number p")),
                }
            })
            .get()

        const totalPage = $(".page_number a:last-child").text().trim() || "1"

        return { results: animeList, totalPage }
    } catch (err) {
        logError(event, err, { module: "animeList" })
        return { results: [], totalPage: "0" }
    }
})
