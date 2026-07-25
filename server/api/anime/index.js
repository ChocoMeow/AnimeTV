import * as cheerio from "cheerio"
import { serverSupabaseClient } from "#supabase/server"

// NOTE: ANIME_CACHE, CHINESE_WEEKDAY_MAP, GAMER_BASE_URL, cfFetch, authUser,
// and parseViews are assumed to be auto-imported from server/utils/*, same
// as in the original file. SPOTLIGHT_CACHE is new — declared below.

const TWO_HOURS = 1000 * 60 * 60 * 2
const CONTINUE_WATCHING_TITLE = "繼續觀看"
const SUGGESTIONS_TITLE = "你可能會喜歡的動畫"

const SPOTLIGHT_CANDIDATE_LIMIT = 50
const SPOTLIGHT_RESULT_LIMIT = 5
const SUGGESTION_HISTORY_LIMIT = 200
const SUGGESTION_TAG_LIMIT = 8
const SUGGESTION_RESULT_LIMIT = 18

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

// Spotlight's "top 50 recent anime" query is identical for every visitor —
// only the per-user watched-filter differs — so it gets its own cache
// instead of being re-run on every request.
const SPOTLIGHT_CACHE = { data: null, timestamp: 0 }

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

/** Parses the raw Gamer homepage HTML into the byDay / themes cache shape. */
function parseAnimePage(html, fetchedAt) {
    const $ = cheerio.load(html)
    const blockItems = scrapeAnimeBlocks($)
    const { allRawItems: themeRawItems, themeRanges } = scrapeThemes($)
    const allRaw = [...blockItems, ...themeRawItems]

    if (!allRaw.length) return { byDay: {}, themes: {}, fetchedAt }

    const blockCount = blockItems.length

    const byDay = {}
    for (let i = 0; i < blockCount; i++) {
        const item = allRaw[i]
        if (!item?.dayCode) continue
        const { dayCode, ...rest } = item
            ; (byDay[dayCode] ??= []).push(rest)
    }

    const themes = {}
    for (const { themeTitle, start, count } of themeRanges)
        themes[themeTitle] = allRaw.slice(blockCount + start, blockCount + start + count)

    return { byDay, themes, fetchedAt }
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
        .limit(SUGGESTION_HISTORY_LIMIT)

    if (!history?.length) return []

    const watchedSet = new Set(history.map(r => r.anime_ref_id))

    // Count tag frequency across watched anime
    const tagCounts = new Map()
    for (const { anime_meta } of history)
        for (const tag of Array.isArray(anime_meta?.tags) ? anime_meta.tags : []) {
            const t = String(tag).trim()
            if (t) tagCounts.set(t, (tagCounts.get(t) || 0) + 1)
        }

    const topTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, SUGGESTION_TAG_LIMIT).map(([tag]) => tag)
    if (!topTags.length) return []

    // Only fetch anime that share at least one top tag, excluding watched, pre-sorted by views/score
    let query = client
        .from("anime_meta")
        .select("source_id, title, thumbnail, premiere_date, views, tags")
        .overlaps("tags", topTags)
        .not("video_id", "is", null)
        .order("views", { ascending: false })
        .order("score", { ascending: false })
        .limit(SUGGESTION_RESULT_LIMIT)

    if (watchedSet.size) query = query.not("source_id", "in", `(${[...watchedSet].join(",")})`)

    const { data: candidates } = await query

    return (candidates || [])
        .map(row => {
            const rowTags = new Set(row.tags?.map(String) ?? [])
            return { ...row, _score: topTags.filter(t => rowTags.has(t)).length }
        })
        .sort((a, b) => b._score - a._score || b.views - a.views)
        .map(({ source_id, title, thumbnail, premiere_date, views }) => ({
            refId: source_id, title, image: thumbnail,
            year: premiere_date ? `${premiere_date.split("-")[0]}/${premiere_date.split("-")[1]}` : null,
            episodes: null, views: views ?? null,
        }))
}

/** Top-50 recent/popular anime — identical for every visitor, so it's cached independently. */
async function getSpotlightCandidates(client) {
    const now = Date.now()
    if (SPOTLIGHT_CACHE.data && now - SPOTLIGHT_CACHE.timestamp < TWO_HOURS)
        return SPOTLIGHT_CACHE.data

    const end = new Date()
    const start = new Date()
    start.setMonth(start.getMonth() - 3)
    const toDate = d => d.toISOString().slice(0, 10)

    const { data, error } = await client
        .from("anime_meta")
        .select("source_id, title, thumbnail")
        .not("video_id", "is", null)
        .gte("premiere_date", toDate(start))
        .lte("premiere_date", toDate(end))
        .order("views", { ascending: false })
        .order("score", { ascending: false })
        .limit(SPOTLIGHT_CANDIDATE_LIMIT)

    if (error || !data?.length) return SPOTLIGHT_CACHE.data || []

    SPOTLIGHT_CACHE.data = data
    SPOTLIGHT_CACHE.timestamp = now
    return data
}

async function getSpotlight(client, userId) {
    const candidates = await getSpotlightCandidates(client)
    if (!candidates.length) return []

    let watchedIds = null
    if (userId) {
        const { data: watched } = await client
            .from("watch_history_latest_updates")
            .select("anime_ref_id")
            .eq("user_id", userId)
            .in("anime_ref_id", candidates.map(c => c.source_id))
        watchedIds = new Set(watched?.map(w => w.anime_ref_id))
    }

    const result = []
    for (const row of candidates) {
        if (watchedIds?.has(row.source_id)) continue
        result.push({ refId: String(row.source_id), title: row.title, image: row.thumbnail })
        if (result.length === SPOTLIGHT_RESULT_LIMIT) break
    }
    return result
}

async function getUserThemes(client, userId) {
    if (!userId) return {}

    const [continueWatching, suggestions] = await Promise.allSettled([
        getContinueWatching(client, userId),
        getSuggestions(client, userId),
    ])

    const out = {}
    if (continueWatching.status === "fulfilled" && continueWatching.value.length)
        out[CONTINUE_WATCHING_TITLE] = continueWatching.value
    if (suggestions.status === "fulfilled" && suggestions.value.length)
        out[SUGGESTIONS_TITLE] = suggestions.value
    return out
}

async function scrapeAllAnime(client, userId) {
    const now = Date.now()
    const fetchedAt = new Date(now).toISOString()
    const empty = { byDay: {}, themes: {}, fetchedAt }

    // Kick off user-specific data immediately — it doesn't depend on the
    // page scrape, so there's no reason to wait for that to finish first.
    const userDataPromise = Promise.allSettled([
        getUserThemes(client, userId),
        getSpotlight(client, userId),
    ])

    let base
    if (ANIME_CACHE.data && now - ANIME_CACHE.timestamp < TWO_HOURS) {
        base = ANIME_CACHE.data
    } else {
        const pageResult = await cfFetch(GAMER_BASE_URL)
        base = pageResult?.html ? parseAnimePage(pageResult.html, fetchedAt) : (ANIME_CACHE.data || empty)
        ANIME_CACHE.timestamp = now
        ANIME_CACHE.data = base
    }

    const [userThemesResult, spotlightResult] = await userDataPromise
    const userThemes = userThemesResult.status === "fulfilled" ? userThemesResult.value : {}
    const spotlight = spotlightResult.status === "fulfilled" ? spotlightResult.value : []

    return { ...base, themes: { ...userThemes, ...base.themes }, spotlight }
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