function escapeHtml(str) {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
}

function escapeRegExp(str) {
    return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build safe HTML with <span class="search-hl"> around query token matches.
 * Uses span (not mark) so browser default yellow <mark> styles never leak.
 */
export function highlightMatch(text, query) {
    const raw = text == null ? '' : String(text)
    if (!raw) return ''
    const q = (query || '').trim()
    if (!q) return escapeHtml(raw)

    const tokens = [...new Set(q.split(/\s+/).filter(Boolean))]
    if (!tokens.length) return escapeHtml(raw)

    const pattern = tokens.map(escapeRegExp).join('|')
    const re = new RegExp(`(${pattern})`, 'gi')

    let result = ''
    let lastIndex = 0
    let match
    while ((match = re.exec(raw)) !== null) {
        result += escapeHtml(raw.slice(lastIndex, match.index))
        result += `<span class="search-hl">${escapeHtml(match[0])}</span>`
        lastIndex = match.index + match[0].length
    }
    result += escapeHtml(raw.slice(lastIndex))
    return result
}

export function truncateText(text, max = 140) {
    if (!text) return null
    const s = String(text).trim()
    if (s.length <= max) return s
    return `${s.slice(0, max).trimEnd()}…`
}
