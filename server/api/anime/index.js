import * as cheerio from "cheerio"
import { serverSupabaseClient } from "#supabase/server"
import { cfFetch, fetchAnimeData, matchAnimeWithDb } from "~~/server/utils/anime"
import { GAMER_BASE_URL, ANIME_CACHE, CHINESE_WEEKDAY_MAP } from "~~/server/utils/global"

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

function isAncestor(ancestor, node) {
    for (let n = node?.parent; n; n = n.parent) {
        if (n === ancestor) return true
    }
    return false
}

function leafOnly(nodes) {
    return nodes.filter(el => !nodes.some(other => other !== el && isAncestor(el, other)))
}

function extractDateLabel($, $el) {
    const selectors = [
        () => $el.find(".anime-date-info").first().text(),
        () => $el.children(".anime-date-info").first().text(),
        () => $el.find(".anime-date-info-block-arrow").first().text(),
        () => $el.find(".anime-date-info-block-rectangle").first().text(),
        () => $el.nextAll(".anime-date-info").first().text(),
        () => $el.parent().find(".anime-date-info").first().text(),
    ]
    for (const fn of selectors) {
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
        if (!dayCode) return

        const refId = $el.attr("data-animesn") || null
        const title = text($, el, ".anime-name")
        const thumbnail = attr($, el, ".anime-blocker img", "data-src") || attr($, el, ".anime-blocker img", "src")
        if (!refId || !title || !thumbnail) return

        items.push({ refId, title, episode: text($, el, ".anime-episode p"), thumbnail, dayCode })
    })
    return items
}

function scrapeThemes($) {
    const themeEls = $(THEME_SELECTOR).toArray()
    const allRawItems = []
    const themeRanges = []

    for (let i = 0; i < themeEls.length; i++) {
        const $el = $(themeEls[i])
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
                views: text($, movie, ".show-view-number p"),
            }
        })
        if (!rawList.length) continue

        const start = allRawItems.length
        allRawItems.push(...rawList)
        themeRanges.push({ themeTitle, start, count: rawList.length })
    }

    return { allRawItems, themeRanges }
}

const TWO_HOURS = 1000 * 60 * 60 * 2

async function scrapeAllAnime(client) {
    const now = Date.now()
    if (ANIME_CACHE.data && now - ANIME_CACHE.timestamp < TWO_HOURS) return ANIME_CACHE.data

    const [pageResult] = await Promise.all([cfFetch(GAMER_BASE_URL), fetchAnimeData()])
    const html = pageResult?.html
    if (!html) return ANIME_CACHE.data || { byDay: {}, themes: {}, fetchedAt: new Date(now).toISOString() }

    const $ = cheerio.load(html)
    const blockItems = scrapeAnimeBlocks($)
    const { allRawItems: themeRawItems, themeRanges } = scrapeThemes($)
    const allRaw = [...blockItems, ...themeRawItems]

    const empty = { byDay: {}, themes: {}, fetchedAt: new Date(now).toISOString() }
    if (!allRaw.length) {
        ANIME_CACHE.timestamp = now
        ANIME_CACHE.data = empty
        return empty
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
        if (!isMatched(item)) continue
        const { dayCode, ...rest } = item
        if (!dayCode) continue
        ;(byDay[dayCode] ??= []).push(rest)
    }

    const themes = {}
    for (const { themeTitle, start, count } of themeRanges) {
        themes[themeTitle] = matchedAll.slice(blockCount + start, blockCount + start + count).filter(isMatched)
    }

    const result = { byDay, themes, fetchedAt: new Date(now).toISOString() }
    ANIME_CACHE.timestamp = now
    ANIME_CACHE.data = result
    return result
}

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    try {
        return await scrapeAllAnime(client)
    } catch (error) {
        console.error("API error:", error)
        throw createError({ statusCode: 500, statusMessage: "Internal Server Error" })
    }
})
