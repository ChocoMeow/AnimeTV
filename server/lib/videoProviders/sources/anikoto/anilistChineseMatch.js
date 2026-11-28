/**
 * Match Bahamut/Chinese titles against soruly/anilist-chinese.
 * Dict is lazy-loaded (local migration copy → .data cache → GitHub raw).
 */
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { moduleLogger } from '~~/server/utils/logger'

const log = moduleLogger('anilist-chinese')
const DICT_URL =
    'https://raw.githubusercontent.com/soruly/anilist-chinese/master/anilist-chinese.json'
const CACHE_TTL_MS = 1000 * 60 * 60 * 24 // 1 day — upstream dict updates daily

const CN_DIGIT = Object.freeze({
    零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4,
    五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
})

let indexPromise = null
let indexLoadedAt = 0

function cnNumeralToInt(raw) {
    const s = String(raw || '')
    if (/^\d+$/.test(s)) return Number(s)
    if (s.length === 1) return CN_DIGIT[s] ?? null
    if (s === '十') return 10
    if (s[0] === '十') return 10 + (CN_DIGIT[s[1]] || 0)
    if (s[1] === '十') return (CN_DIGIT[s[0]] || 0) * 10 + (CN_DIGIT[s[2]] || 0)
    return null
}

function compactZh(s) {
    return String(s || '')
        .normalize('NFKC')
        .replace(/[a-z]+/gi, '')
        .replace(/[^\u4e00-\u9fff\u3400-\u4dbf0-9]/g, '')
}

function compactEn(s) {
    return String(s || '')
        .normalize('NFKC')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '')
}

function stripNoise(s) {
    return String(s || '')
        .normalize('NFKC')
        .replace(/\s*\[[^\]]*\]/g, '')
        .replace(/\s*\([^)]*\)/g, '')
        .replace(/（[^）]*）/g, '')
        .replace(/「|」|『|』/g, '')
        .replace(/[:：]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
}

function parseSeason(title) {
    let stripped = String(title || '')
    let season = null
    let isFinal = false
    const brackets = []

    stripped = stripped.replace(/\[([^\]]+)\]/g, (_, inner) => {
        brackets.push(inner.trim())
        return ' '
    })
    stripped = stripped.replace(/（([^）]+)）|\(([^)]+)\)/g, (_, a, b) => {
        const inner = (a || b || '').trim()
        if (inner && !/^\d{4}$/.test(inner)) brackets.push(inner)
        return ' '
    })

    const take = (re, read) => {
        stripped = stripped.replace(re, (_m, ...rest) => {
            const n = read(_m, ...rest)
            if (n != null && n >= 1 && n <= 20) season = season ?? n
            return ' '
        })
    }

    if (/(final\s*season|最終季|完結篇|最終章)/i.test(stripped)) {
        isFinal = true
        stripped = stripped.replace(/(final\s*season|最終季|完結篇|最終章)/gi, ' ')
    }

    take(/第([一二三四五六七八九十两兩\d]+)季/g, (_m, g1) => cnNumeralToInt(g1))
    take(/第([一二三四五六七八九十两兩\d]+)期/g, (_m, g1) => cnNumeralToInt(g1))
    take(/(\d+)(?:st|nd|rd|th)\s*season/gi, (_m, g1) => Number(g1))
    take(/season\s*(\d+)/gi, (_m, g1) => Number(g1))
    take(/\bs(?:eason)?\s*(\d+)\b/gi, (_m, g1) => Number(g1))
    take(/(?:^|[\s!！])(\d{1,2})(?=\s*$)/g, (_m, g1) => Number(g1))
    take(/\s+([ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]|[IVX]{1,4})\s*$/gi, (_m, g1) => {
        const map = {
            I: 1, II: 2, III: 3, IV: 4, V: 5, VI: 6, VII: 7, VIII: 8, IX: 9, X: 10,
            Ⅰ: 1, Ⅱ: 2, Ⅲ: 3, Ⅳ: 4, Ⅴ: 5, Ⅵ: 6, Ⅶ: 7, Ⅷ: 8, Ⅸ: 9, Ⅹ: 10,
        }
        return map[String(g1).toUpperCase()] ?? null
    })
    take(/([一二三四五六七八九十])之皿/g, (_m, g1) => cnNumeralToInt(g1))

    if (season == null && /(?:NEW\s*GAME|工作細胞)!!+\s*$/i.test(stripped)) season = 2
    if (season == null && /兔子嗎？？+/.test(String(title || ''))) season = 2
    if (season == null && /兔子嗎？\s*BLOOM/i.test(String(title || ''))) season = 3
    if (season == null && /來訪者篇|访客篇/.test(String(title || ''))) {
        season = 2
        stripped = stripped.replace(/來訪者篇|访客篇/g, ' ')
    }
    if (season == null && /告白\?\s*~/.test(String(title || ''))) {
        season = 2
        stripped = stripped.replace(/\?/g, ' ')
    }

    return { season, isFinal, stripped: stripNoise(stripped), brackets }
}

function isWeakZhKey(key) {
    if (!key || key.length < 2) return true
    if (/^第?[一二三四五六七八九十两兩\d]+季$/.test(key)) return true
    if (/^第?[一二三四五六七八九十两兩\d]+期$/.test(key)) return true
    if (/^\d+$/.test(key)) return true
    return false
}

function analyzeTitle(title) {
    const { season, isFinal, stripped, brackets } = parseSeason(title)
    const baseZh = compactZh(stripped)
    const fullZhRaw = compactZh(stripNoise(String(title || '').replace(/\[([^\]]+)\]/g, ' $1 ')))
    const main = stripped.replace(/[^\x00-\x7F]+/g, ' ').replace(/\s+/g, ' ').trim()
    const extra = brackets
        .map((b) => b.replace(/[^\x00-\x7F]+/g, ' ').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
        .join(' ')
    const enHint = [main, extra].filter(Boolean).join(' ').trim()
    const enKey = compactEn(enHint)
    const enKeyBase = compactEn(stripped.replace(/[^\x00-\x7F]+/g, ' '))
    return {
        season,
        isFinal,
        baseZh: isWeakZhKey(baseZh) ? '' : baseZh,
        fullZh: isWeakZhKey(fullZhRaw) ? '' : fullZhRaw,
        enHint: enHint || null,
        enKey: enKey.length >= 3 ? enKey : '',
        enKeyBase: enKeyBase.length >= 3 ? enKeyBase : '',
    }
}

function seasonKeyVariants(baseZh, season) {
    if (!baseZh) return []
    if (season == null) return [baseZh]
    const cn = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'][season]
    const keys = new Set([
        baseZh,
        `${baseZh}${season}`,
        `${baseZh}第${season}季`,
        `${baseZh}第${season}期`,
    ])
    if (cn) {
        keys.add(`${baseZh}第${cn}季`)
        keys.add(`${baseZh}第${cn}期`)
        keys.add(`${baseZh}${cn}`)
    }
    return [...keys]
}

function seasonFit(querySeason, candSeason, queryFinal) {
    if (queryFinal && candSeason == null) return 0.5
    if (querySeason == null && candSeason == null) return 1
    if (querySeason == null) {
        if (candSeason == null || candSeason === 1) return 1
        return 0.35
    }
    if (candSeason == null) return querySeason === 1 ? 0.95 : 0.15
    if (querySeason === candSeason) return 1
    return 0.08
}

function theaterFit(queryTitle, candTitle) {
    const q = /劇場版|剧场版|\bmovie\b/i.test(queryTitle || '')
    const c = /劇場版|剧场版|\bmovie\b/i.test(candTitle || '')
    if (q === c) return 1
    if (!q && c) return 0.2
    return 0.7
}

function levenshtein(a, b) {
    if (a === b) return 0
    if (!a.length) return b.length
    if (!b.length) return a.length
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
    let curr = new Array(b.length + 1)
    for (let i = 1; i <= a.length; i++) {
        curr[0] = i
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost)
        }
        ;[prev, curr] = [curr, prev]
    }
    return prev[b.length]
}

function similarity(a, b) {
    const max = Math.max(a.length, b.length)
    if (!max) return 1
    return 1 - levenshtein(a, b) / max
}

function pushIndex(map, key, item) {
    if (!key) return
    const list = map.get(key) || []
    list.push(item)
    map.set(key, list)
}

function buildDictIndex(dict) {
    const byFullKey = new Map()
    const byBaseKey = new Map()
    const byEnKey = new Map()
    const entries = []

    for (const row of dict) {
        const id = Number(row.id)
        const names = [row.title, ...(row.synonyms || [])].filter(Boolean)
        for (const name of names) {
            const parsed = analyzeTitle(name)
            const item = {
                id,
                title: name,
                fullKey: parsed.fullZh,
                baseKey: parsed.baseZh,
                season: parsed.season,
                isFinal: parsed.isFinal,
                enKey: parsed.enKey,
            }
            entries.push(item)
            pushIndex(byFullKey, parsed.fullZh, item)
            for (const k of seasonKeyVariants(parsed.baseZh, parsed.season)) {
                pushIndex(byFullKey, k, item)
            }
            if (parsed.baseZh) pushIndex(byBaseKey, parsed.baseZh, item)
            if (parsed.enKey) pushIndex(byEnKey, parsed.enKey, item)
        }
    }
    return { byFullKey, byBaseKey, byEnKey, entries }
}

function collectZhHits(query, index) {
    const hits = []
    const variants = [...seasonKeyVariants(query.baseZh, query.season), query.fullZh].filter(Boolean)

    for (const key of new Set(variants)) {
        for (const item of index.byFullKey.get(key) || []) {
            hits.push({ ...item, sim: 1, baseSim: 1, via: 'exact' })
        }
    }

    if (query.baseZh) {
        for (const item of index.byBaseKey.get(query.baseZh) || []) {
            hits.push({ ...item, sim: 1, baseSim: 1, via: 'base' })
        }
    }

    if (hits.length) return hits
    if (!query.baseZh || query.baseZh.length < 3) return hits

    const fuzzy = []
    for (const item of index.entries) {
        if (!item.baseKey || item.baseKey.length < 3) continue
        let baseSim = 0
        if (item.baseKey === query.baseZh) baseSim = 1
        else if (item.baseKey.includes(query.baseZh) || query.baseZh.includes(item.baseKey)) {
            const shorter = Math.min(item.baseKey.length, query.baseZh.length)
            const longer = Math.max(item.baseKey.length, query.baseZh.length)
            if (shorter / longer < 0.7) continue
            baseSim = similarity(query.baseZh, item.baseKey)
            if (baseSim < 0.82) continue
        } else {
            baseSim = similarity(query.baseZh, item.baseKey)
            if (baseSim < 0.9 || Math.abs(item.baseKey.length - query.baseZh.length) > 3) continue
        }
        fuzzy.push({ ...item, sim: baseSim, baseSim, via: 'fuzzy' })
    }
    fuzzy.sort((a, b) => b.baseSim - a.baseSim)
    return fuzzy.slice(0, 24)
}

function collectEnHits(query, index) {
    const keys = [...new Set([query.enKey, query.enKeyBase].filter(Boolean))]
    if (!keys.length) return []
    const hits = []
    for (const k of keys) {
        for (const item of index.byEnKey.get(k) || []) {
            hits.push({ ...item, sim: 1, baseSim: 1, via: 'en_exact' })
        }
    }
    if (hits.length) return hits

    const soft = []
    for (const [key, items] of index.byEnKey) {
        if (key.length < 4) continue
        for (const qk of keys) {
            if (key === qk) continue
            if (key.includes(qk) || qk.includes(key)) {
                const sim = similarity(qk, key)
                if (sim < 0.78) continue
                for (const item of items) soft.push({ ...item, sim, baseSim: sim, via: 'en_fuzzy' })
            }
        }
    }
    soft.sort((a, b) => b.baseSim - a.baseSim)
    return soft.slice(0, 16)
}

function dedupeCandidates(hits, query, queryTitle) {
    const seen = new Set()
    const out = []
    for (const h of hits) {
        if (seen.has(h.id)) continue
        seen.add(h.id)
        const baseSim = h.baseSim ?? h.sim ?? 1
        const sFit = seasonFit(query.season, h.season, query.isFinal)
        const tFit = theaterFit(queryTitle, h.title)
        const score = baseSim * 0.68 + sFit * 0.25 + tFit * 0.07
        out.push({
            anilist_id: h.id,
            matched_as: h.title,
            season: h.season ?? null,
            base_sim: Number(baseSim.toFixed(3)),
            season_fit: Number(sFit.toFixed(3)),
            score: Number(score.toFixed(3)),
        })
    }
    out.sort((a, b) => b.score - a.score || b.base_sim - a.base_sim)
    return out.slice(0, 10)
}

function pickConfidence(candidates, query) {
    if (!candidates.length) return { picked: null, confidence: 'none' }
    const top = candidates[0]
    const second = candidates[1]
    const seasonOk = top.season_fit >= 0.9
    const ambiguous =
        second && second.score >= top.score - 0.05 && second.anilist_id !== top.anilist_id

    let confidence = 'medium'
    if (top.base_sim >= 0.98 && seasonOk && !ambiguous) confidence = 'high'
    else if (top.base_sim >= 0.9 && seasonOk && !ambiguous) confidence = 'high'
    else if (top.season_fit < 0.5 || top.base_sim < 0.85) confidence = 'low'
    else if (ambiguous || query.season != null) confidence = 'medium'

    if (query.season != null && query.season > 1 && top.season_fit < 0.9) {
        confidence = top.season_fit < 0.5 ? 'low' : 'medium'
    }

    return { picked: top, confidence }
}

async function readJsonArray(path) {
    const raw = await readFile(path, 'utf8')
    const data = JSON.parse(raw)
    if (!Array.isArray(data) || !data.length) throw new Error('empty dict')
    return data
}

async function loadDictArray() {
    const cwd = process.cwd()
    const cachePath = join(cwd, '.data/anilist-chinese.json')
    const bootstrapPath = join(cwd, 'scripts/migration-data/anime1-to-anikoto/anilist-chinese.json')

    // Fresh daily cache from DICT_URL
    try {
        const st = await stat(cachePath)
        if (Date.now() - st.mtimeMs <= CACHE_TTL_MS) {
            const data = await readJsonArray(cachePath)
            log.info({ path: cachePath, count: data.length }, 'Loaded anilist-chinese dict (cache)')
            return data
        }
    } catch {
        /* miss / stale */
    }

    try {
        log.info('Downloading anilist-chinese.json from GitHub')
        const res = await fetch(DICT_URL, {
            headers: { Accept: 'application/json', 'User-Agent': 'AnimeHub/1.0' },
        })
        if (!res.ok) throw new Error(`anilist-chinese download HTTP ${res.status}`)
        const data = await res.json()
        if (!Array.isArray(data)) throw new Error('anilist-chinese: unexpected shape')

        try {
            await mkdir(join(cwd, '.data'), { recursive: true })
            await writeFile(cachePath, JSON.stringify(data))
        } catch (err) {
            log.warn({ err }, 'Failed to cache anilist-chinese.json')
        }
        return data
    } catch (err) {
        log.warn({ err }, 'DICT_URL download failed — trying local fallback')
    }

    for (const path of [cachePath, bootstrapPath]) {
        try {
            const data = await readJsonArray(path)
            log.info({ path, count: data.length }, 'Loaded anilist-chinese dict (fallback)')
            return data
        } catch {
            /* try next */
        }
    }

    throw new Error('anilist-chinese dict unavailable')
}

async function getIndex() {
    if (indexPromise && Date.now() - indexLoadedAt <= CACHE_TTL_MS) {
        return indexPromise
    }
    indexPromise = loadDictArray()
        .then((dict) => {
            indexLoadedAt = Date.now()
            return buildDictIndex(dict)
        })
        .catch((err) => {
            indexPromise = null
            indexLoadedAt = 0
            throw err
        })
    return indexPromise
}

/**
 * @param {string} title
 * @returns {Promise<{
 *   anilist_id: number,
 *   matched_as: string,
 *   confidence: 'high'|'medium'|'low',
 *   score: number,
 *   season: number|null,
 *   english_hint: string|null,
 * }|null>}
 */
export async function matchAnilistChinese(title) {
    const raw = String(title || '').trim()
    if (!raw) return null

    let index
    try {
        index = await getIndex()
    } catch (err) {
        log.warn({ err }, 'anilist-chinese index unavailable')
        return null
    }

    const query = analyzeTitle(raw)
    let hits = collectZhHits(query, index)
    if (!hits.length && query.enKey) hits = collectEnHits(query, index)
    if (!hits.length) return null

    const candidates = dedupeCandidates(hits, query, raw)
    const { picked, confidence } = pickConfidence(candidates, query)
    if (!picked || confidence === 'low') return null

    return {
        anilist_id: picked.anilist_id,
        matched_as: picked.matched_as,
        confidence,
        score: picked.score,
        season: query.season,
        english_hint: query.enHint,
    }
}
