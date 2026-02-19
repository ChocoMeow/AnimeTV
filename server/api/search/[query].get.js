import * as cheerio from "cheerio"
import { serverSupabaseClient } from "#supabase/server"

function toResult(row) {
    return {
        refId: row.source_id,
        title: row.title,
        image: row.thumbnail,
        year: row.premiere_date ?? null,
        episodes: null,
        views: row.views ?? null,
    }
}

export default defineEventHandler(async (event) => {
    await authUser(event)

    const rawQuery = getRouterParam(event, "query") ?? ""
    const query = decodeURIComponent(rawQuery).trim()
    if (!query) return { results: [] }

    const client = await serverSupabaseClient(event)

    const [dbRes, gamerRes] = await Promise.all([
        client
            .from("anime_meta")
            .select("source_id, title, thumbnail, premiere_date, views")
            .ilike("title", `%${query}%`)
            .limit(30),
        cfFetch(`${GAMER_BASE_URL}search.php?keyword=${encodeURIComponent(query)}`),
    ])

    const dbResults = (dbRes.data ?? []).map(toResult)
    const dbIds = new Set(dbResults.map((r) => String(r.refId)))

    let gamerList = []
    if (gamerRes?.html) {
        const $ = cheerio.load(gamerRes.html)
        const getText = (el, selector) => $(el).find(selector).text().trim() || null
        const getAttr = (el, selector, attr) => $(el).find(selector).attr(attr)?.trim() || null

        gamerList = $(".animate-theme-list .theme-list-block .theme-list-main")
            .map((_, movie) => {
                const href = $(movie).attr("href") || ""
                const refId = href.match(/sn=(\d+)/)?.[1] || null
                return {
                    refId,
                    image: getAttr(movie, ".theme-img", "data-src"),
                    title: getText(movie, ".theme-name"),
                    year: getText(movie, ".theme-time")?.replace("年份：", "") ?? null,
                    episodes: getText(movie, ".theme-number"),
                    views: getText(movie, ".show-view-number p"),
                }
            })
            .get()
            .filter((r) => r.refId && r.title)
    }

    const merged = [
        ...dbResults,
        ...gamerList.filter((g) => !dbIds.has(String(g.refId))),
    ]

    return { results: merged }
})
