/**
 * Anime list API contract.
 * GET /api/anime/list → `{ results, totalPage }`
 */

const str = (v) => (typeof v === 'string' ? v.trim() : '')

function csvList(value) {
    if (Array.isArray(value)) return value.map((x) => str(x)).filter(Boolean)
    const raw = str(value)
    if (!raw) return []
    return raw.split(',').map((x) => x.trim()).filter(Boolean)
}

/**
 * @param {Record<string, unknown>} query
 * @returns {{ page: number, tags: string[], categories: string[], sort: string | null, category: string }}
 */
export function parseAnimeListQuery(query = {}) {
    const page = Math.max(1, Number.parseInt(String(query.page ?? '1'), 10) || 1)
    const tags = csvList(query.tags)
    const categories = csvList(query.categories)
    const sort = str(query.sort) || null
    const category = str(query.category)

    return { page, tags, categories, sort, category }
}
