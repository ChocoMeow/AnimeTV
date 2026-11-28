/**
 * AniList lookup for admin autofill / auto-add.
 * Prefer soruly/anilist-chinese (Chinese title → id), then enrich via GraphQL.
 * Fallback: AniList search when Chinese dict misses.
 */
import { matchAnilistChinese } from './anilistChineseMatch.js'
import { moduleLogger } from '~~/server/utils/logger'

const log = moduleLogger('anilist-lookup')
const ANILIST_URL = 'https://graphql.anilist.co'
const UA =
    'Mozilla/5.0 (compatible; AnimeHub/1.0; +https://github.com/Anime-Hub)'

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

function normKey(s) {
    return stripNoise(s)
        .toLowerCase()
        .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '')
}

function titleScore(query, media) {
    const q = stripNoise(query).toLowerCase()
    if (!q) return 0
    const titles = [
        media.title?.english,
        media.title?.romaji,
        media.title?.native,
        ...(media.synonyms || []),
    ].filter(Boolean)
    let best = 0
    const qKey = normKey(q)
    for (const t of titles) {
        const tl = String(t).toLowerCase()
        if (tl === q) return 1
        const tKey = normKey(t)
        if (qKey && tKey && (qKey === tKey || qKey.includes(tKey) || tKey.includes(qKey))) {
            best = Math.max(best, 0.92)
            continue
        }
        const qt = q.split(/\s+/).filter((x) => x.length > 1)
        const tt = new Set(tl.split(/\s+/).filter((x) => x.length > 1))
        if (!qt.length) continue
        const hit = qt.filter((x) => tt.has(x) || [...tt].some((y) => y.includes(x) || x.includes(y))).length
        best = Math.max(best, hit / qt.length)
    }
    return best
}

function scoreMedia(query, media, year) {
    let score = titleScore(query, media)
    const mediaYear = media.seasonYear || media.startDate?.year || null
    if (year && mediaYear) {
        const delta = Math.abs(year - mediaYear)
        if (delta === 0) score += 0.12
        else if (delta === 1) score += 0.04
        else if (delta >= 3) score -= 0.2
    }
    const qSeason = seasonFromText(query)
    const blob = [media.title?.english, media.title?.romaji, media.title?.native, ...(media.synonyms || [])]
        .filter(Boolean)
        .join(' ')
    const mSeason = seasonFromText(blob)
    if (qSeason != null && mSeason != null) score += mSeason === qSeason ? 0.1 : -0.22
    if (qSeason != null && qSeason > 1 && mSeason == null) score -= 0.1
    const wantsMovie = /劇場版|剧场版|\bmovie\b/i.test(query)
    const isMovie = media.format === 'MOVIE' || /movie/i.test(blob)
    if (wantsMovie !== isMovie) score -= 0.12
    return score
}

function mediaToResult(media, score, extra = {}) {
    return {
        anilist_id: media.id,
        english_title: media.title?.english || media.title?.romaji || null,
        romaji: media.title?.romaji || null,
        native: media.title?.native || null,
        year: media.seasonYear || media.startDate?.year || null,
        score: Number(score.toFixed(3)),
        ...extra,
    }
}

async function anilistGraphql(query, variables) {
    for (let attempt = 0; attempt < 3; attempt++) {
        const res = await fetch(ANILIST_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'User-Agent': UA,
            },
            body: JSON.stringify({ query, variables }),
        })
        if (res.status === 429) {
            const retry = Number(res.headers.get('Retry-After') || 30)
            await new Promise((r) => setTimeout(r, (retry + 1) * 1000))
            continue
        }
        if (!res.ok) {
            const text = await res.text()
            throw new Error(`AniList HTTP ${res.status}: ${text.slice(0, 160)}`)
        }
        const json = await res.json()
        if (json.errors?.length) {
            const msg = json.errors.map((e) => e.message).join('; ')
            if (/too many requests/i.test(msg)) {
                await new Promise((r) => setTimeout(r, 30_000))
                continue
            }
            throw new Error(`AniList GraphQL: ${msg}`)
        }
        return json.data
    }
    return null
}

const MEDIA_FIELDS = `
  id
  title { romaji english native }
  synonyms
  startDate { year }
  seasonYear
  format
`

async function anilistFetchById(id) {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) { ${MEDIA_FIELDS} }
      }
    `
    const data = await anilistGraphql(query, { id: Number(id) })
    return data?.Media || null
}

async function anilistSearch(search) {
    const query = `
      query ($search: String) {
        Page(page: 1, perPage: 10) {
          media(search: $search, type: ANIME, sort: SEARCH_MATCH) { ${MEDIA_FIELDS} }
        }
      }
    `
    const data = await anilistGraphql(query, { search })
    return data?.Page?.media || []
}

async function lookupViaChineseDict(title) {
    const hit = await matchAnilistChinese(title)
    if (!hit) return null

    try {
        const media = await anilistFetchById(hit.anilist_id)
        if (media) {
            return mediaToResult(media, hit.score, {
                match_via: 'anilist_chinese',
                confidence: hit.confidence,
                matched_as: hit.matched_as,
            })
        }
    } catch (err) {
        log.warn({ err, id: hit.anilist_id }, 'AniList fetch-by-id failed after Chinese match')
    }

    // Dict hit is still useful even if GraphQL fails — english may be missing
    return {
        anilist_id: hit.anilist_id,
        english_title: hit.english_hint || null,
        romaji: null,
        native: hit.matched_as || null,
        year: null,
        score: hit.score,
        match_via: 'anilist_chinese',
        confidence: hit.confidence,
        matched_as: hit.matched_as,
    }
}

async function lookupViaGraphqlSearch(title, year, threshold) {
    // AniList search is unreliable with Chinese — only try Latin/English tokens.
    const q = englishQuery(title)
    if (!q) return null

    let best = null
    try {
        const mediaList = await anilistSearch(q)
        for (const media of mediaList) {
            const score = scoreMedia(q, media, year)
            if (!best || score > best.score) {
                best = mediaToResult(media, score, { match_via: 'anilist_search' })
            }
        }
    } catch (err) {
        log.warn({ err, q }, 'AniList search failed')
    }

    if (!best || best.score < threshold) return null
    return best
}

/**
 * @param {string} title
 * @param {{ year?: string|number|null, threshold?: number }} [opts]
 * @returns {Promise<{
 *   anilist_id: number,
 *   english_title: string|null,
 *   romaji: string|null,
 *   native: string|null,
 *   year: number|null,
 *   score: number,
 *   match_via?: string,
 *   confidence?: string,
 *   matched_as?: string,
 * }|null>}
 */
export async function lookupAnilist(title, opts = {}) {
    const threshold = opts.threshold ?? 0.72
    const year = yearOf(opts.year)
    const raw = String(title || '').trim()
    if (!raw) return null

    // 1) Chinese dict first (Bahamut titles)
    const fromDict = await lookupViaChineseDict(raw)
    if (fromDict) return fromDict

    // 2) Fallback GraphQL search
    return lookupViaGraphqlSearch(raw, year, threshold)
}
