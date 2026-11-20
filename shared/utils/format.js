/**
 * Shared format / parse helpers (app + server).
 *
 * Naming: format* → display string, parse* → structured value, is* → predicate.
 */

const NUM = new Intl.NumberFormat('en-US')
const pad2 = (n) => String(n).padStart(2, '0')

function asNumber(value, fallback = NaN) {
    const n = Number(value)
    return Number.isFinite(n) ? n : fallback
}

/** Postgres `timestamp without time zone` → treat naive strings as UTC. */
export function parseTimestamp(value) {
    if (value instanceof Date) return value
    if (typeof value === 'number') return new Date(value)
    if (!value) return new Date(NaN)
    const text = String(value).trim()
    const naive = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)
        && !/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text)
    return new Date(naive ? `${text.replace(' ', 'T')}Z` : text)
}

function validDate(value) {
    const date = parseTimestamp(value)
    return Number.isFinite(date.getTime()) ? date : null
}

/** Seconds → `m:ss` or `h:mm:ss`. */
export function formatDuration(seconds) {
    const sec = Math.floor(asNumber(seconds, -1))
    if (sec < 0) return '0:00'
    const h = Math.floor(sec / 3600)
    const m = Math.floor((sec % 3600) / 60)
    const s = sec % 60
    return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`
}

/** Date → local `HH:MM`. */
export function formatClock(value) {
    const date = validDate(value)
    return date ? `${pad2(date.getHours())}:${pad2(date.getMinutes())}` : '00:00'
}

/** Date → relative Chinese label (`剛剛`, `5 分鐘前`, …). */
export function formatRelative(value) {
    const date = validDate(value)
    if (!date) return ''
    const ms = Date.now() - date.getTime()
    if (ms < 60_000) return '剛剛'
    if (ms < 3_600_000) return `${Math.floor(ms / 60_000)} 分鐘前`
    if (ms < 86_400_000) return `${Math.floor(ms / 3_600_000)} 小時前`
    const days = Math.floor(ms / 86_400_000)
    if (days === 1) return '昨天'
    if (days < 7) return `${days} 天前`
    if (days < 30) return `${Math.floor(days / 7)} 週前`
    return `${Math.floor(days / 30)} 個月前`
}

/** Date → locale calendar date. */
export function formatDate(value) {
    const date = validDate(value)
    if (!date) return ''
    const locale = typeof navigator !== 'undefined'
        ? navigator.language || navigator.languages?.[0]
        : undefined
    return date.toLocaleDateString(locale)
}

/** View count → display (`8,000` / `28萬`). */
export function formatViews(views) {
    const n = asNumber(views, -1)
    if (n < 0) return '0'
    return n >= 10_000 ? `${NUM.format(Math.round(n / 10_000))}萬` : NUM.format(n)
}

/** Premiere string → `yyyy/mm`. */
export function formatYearMonth(value) {
    if (value == null || value === '') return null
    const s = String(value).trim()
    const m = s.match(/^(\d{4})[-/](\d{1,2})(?:[-/]\d{1,2})?$/)
    return m ? `${m[1]}/${pad2(m[2])}` : s
}

/** Scraped view text (`1.2萬`) → number. */
export function parseViews(text) {
    if (!text) return 0
    const raw = String(text).trim()
    if (raw.includes('萬')) {
        const n = asNumber(raw.replace('萬', '').replace(/[^\d.]/g, ''), NaN)
        return Number.isNaN(n) ? 0 : Math.round(n * 10_000)
    }
    return asNumber(raw.replace(/[^\d]/g, ''), 0) || 0
}

export function isNumericString(str) {
    return /^[+-]?\d+(\.\d+)?$/.test(str)
}
