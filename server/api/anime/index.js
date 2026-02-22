import * as cheerio from "cheerio"
import { serverSupabaseClient } from "#supabase/server"

const TWO_HOURS = 1000 * 60 * 60 * 2
const CONTINUE_WATCHING_TITLE = "繼續觀看"
const SUGGESTIONS_TITLE = "你可能會喜歡的動畫"

const THEME_SELECTOR = [
    "#blockHotAnime.animate-theme-list",
    "#blockAnimeNewArrive.animate-theme-list",
    '[id^="blockAnimeNewArrive-"].animate-theme-list',
].join(", ")

const ITEM_SELECTOR = [
    ".theme-list-block", ".theme-list .theme-list-block",
    ".theme-item", ".theme-list-item",
    ".theme-list a", ".theme-list-block a",
].join(", ")

const text = ($, el, sel) => $(el).find(sel).text().trim() || null
const attr = ($, el, sel, a) => $(el).find(sel).attr(a)?.trim() || null

// Walk up the tree to check ancestor relationship
function isAncestor(ancestor, node) {
    for (let n = node?.parent; n; n = n.parent)
        if (n === ancestor) return true
    return false
}

const leafOnly = nodes => nodes.filter(el => !nodes.some(other => other !== el && isAncestor(el, other)))

function extractDateLabel($, $el) {
    const fns = [
        () => $el.find(".anime-date-info").first().text(),
        () => $el.children(".anime-date-info").first().text(),
        () => $el.find(".anime-date-info-block-arrow").first().text(),
        () => $el.find(".anime-date-info-block-rectangle").first().text(),
        () => $el.nextAll(".anime-date-info").first().text(),
        () => $el.parent().find(".anime-date-info").first().text(),
    ]
    for (const fn of fns) {
        const t = fn()?.trim()
        if (t) return t
    }
    return ""
}

function resolveDayCode(dateLabel, $el) {
    const m = dateLabel.match(/(\d{1,2}\s*\/\s*\d{1,2})(?:\s*[\uFF08(]\s*([一二三四五六日])\s*[\uFF09)])?/)
    if (m?.[2] && CHINESE_WEEKDAY_MAP[m[2]]) return CHINESE_WEEKDAY_MAP[m[2]]
    return $el.attr("data-date-code") ? String($el.attr("data-date-code")) : null
}

function scrapeAnimeBlocks($) {
    const items = []
    $(".newanime-date-area").each((_, el) => {
        const $el = $(el)
        const dayCode = resolveDayCode(extractDateLabel($, $el), $el)
        const refId = $el.attr("data-animesn") || null
        const title = text($, el, ".anime-name")
        const thumbnail = attr($, el, ".anime-blocker img", "data-src") || attr($, el, ".anime-blocker img", "src")
        if (!dayCode || !refId || !title || !thumbnail) return
        items.push({ refId, title, episode: text($, el, ".anime-episode p"), thumbnail, dayCode })
    })
    return items
}

function scrapeThemes($) {
    const allRawItems = []
    const themeRanges = []

    $(THEME_SELECTOR).each((i, el) => {
        const $el = $(el)
        const themeTitle = $el.find(".theme-title").text().trim() || $el.attr("id") || `unknown-${i}`

        let $items = $el.find(ITEM_SELECTOR)
        if (!$items.length) $items = $el.nextAll().find(ITEM_SELECTOR)
        if (!$items.length) $items = $el.parent().find(ITEM_SELECTOR)

        const rawList = leafOnly($items.toArray()).map(movie => {
            const href = $(movie).attr("href") || $(movie).find("a").attr("href") || ""
            return {
                refId: href.match(/sn=(\d+)/)?.[1] || null,
                image: attr($, movie, ".theme-img", "data-src"),
                title: text($, movie, ".theme-name"),
                year: text($, movie, ".theme-time")?.replace("年份：", "") || null,
                episodes: text($, movie, ".theme-number"),
                views: parseViews(text($, movie, ".show-view-number p")),
            }
        })
        if (!rawList.length) return

        themeRanges.push({ themeTitle, start: allRawItems.length, count: rawList.length })
        allRawItems.push(...rawList)
    })

    return { allRawItems, themeRanges }
}

async function getContinueWatching(client, userId) {
    if (!userId) return []

    const { data, error } = await client
        .from("watch_history_latest_updates")
        .select(`anime_ref_id, anime_title, anime_image, episode_number, progress_percentage, updated_at, anime_meta(source_id, premiere_date, views)`)
        .eq("user_id", userId)
        .lt("progress_percentage", 90)
        .order("updated_at", { ascending: false })
        .limit(6)

    if (error) return []

    const seen = new Set()
    return data
        .filter(row => !seen.has(row.anime_ref_id) && seen.add(row.anime_ref_id))
        .map(row => {
            const meta = row.anime_meta
            const premiereDate = meta?.premiere_date?.split("-")
            return {
                refId: row.anime_ref_id,
                title: meta?.title ?? row.anime_title,
                image: meta?.thumbnail ?? row.anime_image,
                episodes: row.episode_number != null ? `第 ${row.episode_number} 集` : null,
                year: premiereDate ? `${premiereDate[0]}/${premiereDate[1]}` : null,
                views: meta?.views ?? null,
                progress_percentage: row.progress_percentage,
            }
        })
}

async function getSuggestions(client, userId) {
    if (!userId) return []

    const { data: history } = await client
        .from("watch_history_latest_updates")
        .select("anime_ref_id, anime_meta!anime_ref_id(tags)")
        .eq("user_id", userId)

    if (!history?.length) return []

    const watchedSet = new Set(history.map(r => r.anime_ref_id))
    console.log(watchedSet)
    // Count tag frequency across watched anime
    const tagCounts = new Map()
    for (const { anime_meta } of history)
        for (const tag of Array.isArray(anime_meta?.tags) ? anime_meta.tags : []) {
            const t = String(tag).trim()
            if (t) tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
        }

    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([tag]) => tag)
    console.log(topTags)
    if (!topTags.length) return []

    // Only fetch anime that share at least one top tag, excluding watched, pre-sorted by views
    const { data: candidates } = await client
        .from("anime_meta")
        .select("source_id, title, thumbnail, premiere_date, views, tags")
        .overlaps("tags", topTags)
        .not("source_id", "in", `(${[...watchedSet].join(",")})`)
        .order("views", { ascending: false }, "score", { ascending: false })
        .limit(18)

    return (candidates || [])
        .map(row => {
            const rowTags = new Set(row.tags?.map(String) ?? [])
            return { ...row, _score: topTags.filter(t => rowTags.has(t)).length }
        })
        .sort((a, b) => b._score - a._score || b.views - a.views)
        .map(({ source_id, title, thumbnail, premiere_date, views }) => ({
            refId: source_id, title, image: thumbnail,
            year: `${premiere_date?.split("-")[0]}/${premiere_date?.split("-")[1]}` ?? null,
            episodes: null, views: views ?? null,
        }))
}

async function getUserThemes(client, userId) {
    if (!userId) return {}
    const [continueWatching, suggestions] = await Promise.all([
        getContinueWatching(client, userId),
        getSuggestions(client, userId),
    ])
    const out = {}
    if (continueWatching?.length) out[CONTINUE_WATCHING_TITLE] = continueWatching
    if (suggestions?.length) out[SUGGESTIONS_TITLE] = suggestions
    return out
}

async function scrapeAllAnime(client, userId) {
    const now = Date.now()
    const fetchedAt = new Date(now).toISOString()
    const empty = { byDay: {}, themes: {}, fetchedAt }

    const mergeUserThemes = async (base) => {
        const userThemes = await getUserThemes(client, userId)
        return { ...base, themes: { ...userThemes, ...base.themes } }
    }

    if (ANIME_CACHE.data && now - ANIME_CACHE.timestamp < TWO_HOURS)
        return mergeUserThemes(ANIME_CACHE.data)

    const [pageResult] = await Promise.all([cfFetch(GAMER_BASE_URL), fetchAnimeData()])
    if (!pageResult?.html) {
        return mergeUserThemes(ANIME_CACHE.data || empty)
    }

    const $ = cheerio.load(pageResult.html)
    const blockItems = scrapeAnimeBlocks($)
    const { allRawItems: themeRawItems, themeRanges } = scrapeThemes($)
    const allRaw = [...blockItems, ...themeRawItems]

    if (!allRaw.length) {
        ANIME_CACHE.timestamp = now
        ANIME_CACHE.data = empty
        return mergeUserThemes(empty)
    }

    const matchedAll = await matchAnimeWithDb(client, allRaw).catch(err => {
        console.error("Error matching anime", err)
        return allRaw
    })

    const isMatched = item => item?.inDb || item?.matchedVideo
    const blockCount = blockItems.length

    const byDay = {}
    for (let i = 0; i < blockCount; i++) {
        const item = matchedAll[i]
        if (!isMatched(item) || !item.dayCode) continue
        const { dayCode, ...rest } = item
            ; (byDay[dayCode] ??= []).push(rest)
    }

    const themes = {}
    for (const { themeTitle, start, count } of themeRanges)
        themes[themeTitle] = matchedAll.slice(blockCount + start, blockCount + start + count).filter(isMatched)

    ANIME_CACHE.timestamp = now
    ANIME_CACHE.data = { byDay, themes, fetchedAt }

    return mergeUserThemes(ANIME_CACHE.data)
}

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    try {
        return await scrapeAllAnime(client, user?.id ?? user?.sub ?? null)
    } catch (error) {
        console.error("API error:", error)
        throw createError({ statusCode: 500, statusMessage: "Internal Server Error" })
    }
})