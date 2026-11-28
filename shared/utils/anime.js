/**
 * Shared anime catalog constants / helpers (app + server).
 */

// ── Site / scrape ────────────────────────────────────────────────────────────

export const GAMER_BASE_URL = 'https://ani.gamer.com.tw/'
export const ACG_GAMER_BASE_URL = 'https://acg.gamer.com.tw/'
export const ANILIST_SITE_URL = 'https://anilist.co/'

/** `{value}` kept literal when building admin link templates. */
export const acgDetailUrl = (id) => `${ACG_GAMER_BASE_URL}acgDetail.php?s=${id}`
export const anilistAnimeUrl = (id) => `${ANILIST_SITE_URL}anime/${id}`

/** Manual / autofill source_ids start here; Bahamut anime SNs stay below this. */
export const CUSTOM_SOURCE_ID_MIN = 1_000_000

/** `2024-4-7` / `2024/4/7` / `2024年4月7日` → `YYYY-MM-DD`. */
export function parsePremiereDate(value) {
    if (!value) return null
    const m = String(value).trim().match(/^(\d{4})\D+(\d{1,2})(?:\D+(\d{1,2}))?/)
    return m ? `${m[1]}-${m[2].padStart(2, '0')}-${(m[3] || '1').padStart(2, '0')}` : null
}

/** Premiere → 春/夏/秋/冬 (anime1-style). */
export function seasonFromPremiereDate(value) {
    const iso = parsePremiereDate(value)
    if (!iso) return null
    const month = Number(iso.slice(5, 7))
    if (month <= 3) return '冬'
    if (month <= 6) return '春'
    if (month <= 9) return '夏'
    return '秋'
}

export const CACHE_LIFETIME = 1000 * 60 * 60 * 12 // 12 hours
export const EPISODE_LIST_CACHE_LIFETIME = 0

export const CHINESE_WEEKDAY_MAP = Object.freeze({
    一: '1',
    二: '2',
    三: '3',
    四: '4',
    五: '5',
    六: '6',
    日: '7',
})

// ── Tags ─────────────────────────────────────────────────────────────────────

/** Filter tags (exclude「全部」). Used by browse + admin autofill. */
export const ANIME_TAGS = [
    '動作', '冒險', '奇幻', '異世界', '魔法', '超能力', '科幻', '機甲',
    '校園', '喜劇', '戀愛', '青春', '勵志', '溫馨', '悠閒', '料理',
    '親情', '感人', '運動', '競技', '偶像', '音樂', '職場', '推理',
    '懸疑', '時間穿越', '歷史', '戰爭', '血腥暴力', '靈異神怪', '黑暗',
    '特攝', 'BL', 'GL',
]

/** Match known tags inside a compound label, e.g. 奇幻冒險 → [奇幻, 冒險]. */
export function matchAnimeTags(raw) {
    const text = String(raw || '').trim()
    if (!text) return []

    const known = [...ANIME_TAGS].sort((a, b) => b.length - a.length)
    const matched = []
    let remaining = text

    for (const tag of known) {
        if (!remaining.includes(tag)) continue
        matched.push(tag)
        remaining = remaining.split(tag).join('')
    }

    return matched
}

// ── Watch history embeds ─────────────────────────────────────────────────────

export const WATCH_ANIME_META = 'anime_meta!anime_ref_id(title, thumbnail, premiere_date)'
export const WATCH_ANIME_META_INNER = 'anime_meta!anime_ref_id!inner(title, thumbnail, premiere_date)'

export function withAnimeCover(row) {
    if (!row) return row
    const { anime_meta: meta, ...rest } = row
    return {
        ...rest,
        anime_title: meta?.title || '',
        anime_image: meta?.thumbnail || '',
        premiere_date: meta?.premiere_date ?? null,
    }
}

export function withAnimeCovers(rows) {
    return (rows || []).map(withAnimeCover)
}
