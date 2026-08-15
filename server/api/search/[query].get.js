import * as cheerio from "cheerio"
import { serverSupabaseClient } from "#supabase/server"
import { GAMER_BASE_URL } from "~~/shared/global"
import { searchAnimeMeta } from "~~/server/utils/pgroongaSearch"

function truncateDescription(text, max = 140) {
    if (!text || typeof text !== 'string') return null
    const s = text.trim()
    if (!s) return null
    if (s.length <= max) return s
    return `${s.slice(0, max).trimEnd()}…`
}

function toResult(row) {
    const scoreRaw = row.score
    const score = scoreRaw != null && Number(scoreRaw) > 0 ? Number(scoreRaw) : null
    return {
        refId: row.source_id,
        title: row.title,
        image: row.thumbnail,
        year: toYearMonthSlash(row.premiere_date),
        episodes: null,
        views: row.views ?? null,
        description: truncateDescription(row.description),
        score,
    }
}

export default defineEventHandler(async (event) => {
    await authUser(event)

    const rawQuery = getRouterParam(event, "query") ?? ""
    const query = decodeURIComponent(rawQuery).trim()
    if (!query) return { results: [] }

    const client = await serverSupabaseClient(event)

    const [dbData, gamerRes] = await Promise.all([
        searchAnimeMeta(client, query, { limit: 30 }),
        cfFetch(`${GAMER_BASE_URL}search.php?keyword=${encodeURIComponent(query)}`),
    ])

    // RPC does not return description; hydrate snippets for list highlighting
    const sourceIds = dbData.map((row) => row.source_id).filter((id) => id != null)
    let descriptionById = new Map()
    if (sourceIds.length) {
        const { data: descRows } = await client.from('anime_meta').select('source_id, description').in('source_id', sourceIds)
        descriptionById = new Map((descRows || []).map((row) => [String(row.source_id), row.description]))
    }

    const dbResults = dbData.map((row) =>
        toResult({
            ...row,
            description: descriptionById.get(String(row.source_id)) ?? row.description,
        }),
    )
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
                    year: toYearMonthSlash(getText(movie, ".theme-time")?.replace("年份：", "") ?? null),
                    episodes: getText(movie, ".theme-number"),
                    views: parseViews(getText(movie, ".show-view-number p")),
                    description: null,
                    score: null,
                }
            })
            .get()
            .filter((r) => r.refId && r.title)
    }

    return {
        results: [
            ...dbResults,
            ...gamerList.filter((g) => !dbIds.has(String(g.refId))),
        ],
    }
})
