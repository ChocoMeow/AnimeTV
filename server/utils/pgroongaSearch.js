/** Strip PGroonga query operators so user input is treated as plain keywords. */
export function sanitizePgroongaQuery(value) {
    if (!value || typeof value !== 'string') return ''
    return value
        .replace(/[\\()*\-+:]/g, ' ')
        .replace(/\bOR\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim()
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
    return data ?? []
}
