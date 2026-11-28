/**
 * AniKoto title → watch-slug search for admin autofill / scrape.
 * Keyword search only (no AniList bridge) — prefer English tokens in Bahamut titles.
 */
import { moduleLogger } from '~~/server/utils/logger'

const log = moduleLogger('anikoto-search')
const SITE = 'https://anikoto.cz'
const UA =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

function decodeEntities(s = '') {
    return s
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
        .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
}

function stripNoise(s) {
    return String(s || '')
        .normalize('NFKC')
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/（[^）]*）/g, '')
        .replace(/[:：]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function englishQuery(title) {
    const en = stripNoise(title)
        .replace(/[^\x00-\x7F]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
    return en.length >= 3 ? en : ''
}

function yearOf(value) {
    if (!value) return null
    const m = String(value).match(/(\d{4})/)
    return m ? Number(m[1]) : null
}

function seasonFromText(text) {
    const s = String(text || '')
    const m =
        s.match(/(\d+)(?:st|nd|rd|th)\s*season/i) ||
        s.match(/season\s*(\d+)/i) ||
        s.match(/第([一二三四五六七八九十\d]+)季/)
    if (!m) return null
    const map = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10 }
    if (map[m[1]] != null) return map[m[1]]
    const n = Number(m[1])
    return Number.isFinite(n) ? n : null
}

function titleScore(query, candidateTitle) {
    const a = stripNoise(query).toLowerCase()
    const b = stripNoise(decodeEntities(candidateTitle)).toLowerCase()
    if (!a || !b) return 0
    if (a === b) return 1
    const ac = a.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '')
    const bc = b.replace(/[^a-z0-9\u4e00-\u9fff]+/g, '')
    if (ac && bc && (ac === bc || ac.includes(bc) || bc.includes(ac))) return 0.92
    // token overlap
    const at = a.split(/\s+/).filter((t) => t.length > 1)
    const bt = new Set(b.split(/\s+/).filter((t) => t.length > 1))
    if (!at.length) return 0
    const hit = at.filter((t) => bt.has(t) || [...bt].some((x) => x.includes(t) || t.includes(x))).length
    return hit / at.length
}

function parseSearchResults(html) {
    const results = []
    const seen = new Set()
    const re =
        /<img[^>]+alt="([^"]*)"[^>]*>[\s\S]{0,500}?\/watch\/([a-z0-9-]+)(?:\/ep-\d+)?/gi
    for (const m of html.matchAll(re)) {
        const title = decodeEntities(m[1])
        const slug = m[2]
        if (!slug || seen.has(slug)) continue
        seen.add(slug)
        results.push({ slug, title })
    }
    return results
}

async function fetchSearch(keyword) {
    const url = `${SITE}/filter?keyword=${encodeURIComponent(keyword)}`
    const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'text/html,*/*', Referer: `${SITE}/` },
    })
    if (!res.ok) throw new Error(`AniKoto search HTTP ${res.status}`)
    return parseSearchResults(await res.text())
}

function pickBest(query, results, year) {
    if (!results.length) return null
    const qSeason = seasonFromText(query)
    const scored = results.map((r, i) => {
        let score = titleScore(query, r.title || r.slug)
        const hSeason = seasonFromText(r.title) ?? seasonFromText(r.slug)
        if (qSeason != null && hSeason != null) score += hSeason === qSeason ? 0.12 : -0.25
        if (qSeason != null && qSeason > 1 && hSeason == null) score -= 0.12
        if (!/movie|劇場版|film/i.test(query) && /movie|film/i.test(r.title || '')) score -= 0.15
        score -= i * 0.01
        return { ...r, score }
    })
    scored.sort((a, b) => b.score - a.score)
    const best = scored[0]
    // year unused for HTML search (no year on cards reliably) — kept for API shape
    void year
    return {
        slug: best.slug,
        title: best.title,
        score: Number(best.score.toFixed(3)),
        results: scored.slice(0, 8).map(({ slug, title, score }) => ({
            slug,
            title,
            score: Number(score.toFixed(3)),
        })),
    }
}

/**
 * @param {string} title
 * @param {{ year?: string|number|null, threshold?: number }} [opts]
 * @returns {Promise<{ slug: string, title: string|null, score: number, results: object[] }|null>}
 */
export async function searchAnikotoSlug(title, opts = {}) {
    const threshold = opts.threshold ?? 0.78
    const year = yearOf(opts.year)
    const raw = String(title || '').trim()
    if (!raw) return null

    const queries = [...new Set([englishQuery(raw), stripNoise(raw)].filter((q) => q && q.length >= 2))]

    let best = null
    for (const q of queries) {
        try {
            const results = await fetchSearch(q)
            const picked = pickBest(q, results, year)
            if (!picked) continue
            if (!best || picked.score > best.score) best = picked
            if (picked.score >= 0.95) break
        } catch (err) {
            log.warn({ err, q }, 'AniKoto search failed')
        }
    }

    if (!best || best.score < threshold) return null
    return best
}

/**
 * Drop-in shape close to matchAnime() for autofill / scrape.
 * matchedVideo.id = AniKoto watch slug.
 */
export async function matchAnikoto(animeList, matchThreshold = 0.78) {
    if (!animeList?.length) return []
    const out = []
    for (const anime of animeList) {
        if (!anime?.title) continue
        const hit = await searchAnikotoSlug(anime.title, {
            year: anime.year,
            threshold: matchThreshold,
        })
        if (!hit) continue
        out.push({
            ...anime,
            matchedVideo: {
                id: hit.slug,
                title: hit.title,
                matchScore: hit.score,
                results: hit.results,
            },
        })
    }
    return out
}
