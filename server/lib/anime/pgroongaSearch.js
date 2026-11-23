/** Space consecutive CJK so PGroonga `&@~` ANDs chars (allows gaps like 的). */
const CJK_PAIR = /([\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])(?=[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff])/g
const PUNCT = /\p{P}+|\s+/gu

export function sanitizePgroongaQuery(value) {
    if (!value || typeof value !== 'string') return ''
    return value
        .replace(/[\\()*\-+:]/g, ' ')
        .replace(/\bOR\b/gi, ' ')
        .replace(CJK_PAIR, '$1 ')
        .replace(/\s+/g, ' ')
        .trim()
}

function compact(s) {
    return String(s || '').replace(PUNCT, '')
}

/** Title closeness after spaced recall — higher is better. */
function titleRank(title, query) {
    const q = compact(query)
    const t = compact(title)
    if (!q || !t) return 0
    if (t === q) return 1e6
    if (t.includes(q)) return 8e5 + (q.length / t.length) * 1e4

    // Ordered subsequence covers mid-title gaps (e.g. 的) without stripping Chinese.
    let i = 0
    let start = -1
    let end = -1
    for (let j = 0; j < t.length && i < q.length; j++) {
        if (t[j] !== q[i]) continue
        if (start < 0) start = j
        end = j
        i++
    }
    if (i === q.length) {
        const density = q.length / (end - start + 1)
        return 5e5 + density * 5e4 + (q.length / t.length) * 1e4
    }

    let hits = 0
    for (const ch of q) if (t.includes(ch)) hits++
    return hits * 100
}

function rankByTitle(rows, query) {
    return rows
        .map((row, index) => ({ row, index, rank: titleRank(row.title, query) }))
        .sort((a, b) => b.rank - a.rank || a.index - b.index)
        .map(({ row }) => row)
}

export async function searchAnimeMeta(client, query, { limit = 30, requireVideo = false } = {}) {
    const searchQuery = sanitizePgroongaQuery(query)
    if (!searchQuery) return []

    const { data, error } = await client.rpc('search_anime_meta', {
        search_query: searchQuery,
        result_limit: limit,
        require_video: requireVideo,
    })
    if (error) throw error
    return rankByTitle(data ?? [], query)
}
