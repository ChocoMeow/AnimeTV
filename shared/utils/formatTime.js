/**
 * Format seconds as time string: "m:ss" or "h:mm:ss" when >= 1 hour.
 * @param {number} time - Time in seconds
 * @returns {string} e.g. "5:23" or "1:45:00"
 */
export function formatTime(time) {
    const sec = Math.floor(Number(time))
    if (!Number.isFinite(sec) || sec < 0) return "0:00"
    const hours = Math.floor(sec / 3600)
    const minutes = Math.floor((sec % 3600) / 60)
    const seconds = sec % 60
    const pad = (n) => n.toString().padStart(2, "0")
    if (hours > 0) {
        return `${hours}:${pad(minutes)}:${pad(seconds)}`
    }
    return `${minutes}:${pad(seconds)}`
}

/**
 * Format a date/datetime value as clock time "HH:MM".
 * @param {string|Date|number} dateInput - ISO date string, Date instance, or timestamp
 * @returns {string} e.g. "14:30"
 */
export function formatClockTime(dateInput) {
    const date = parseDbTimestamp(dateInput)
    if (!Number.isFinite(date.getTime())) return "00:00"
    const hours = date.getHours().toString().padStart(2, "0")
    const minutes = date.getMinutes().toString().padStart(2, "0")
    return `${hours}:${minutes}`
}

/**
 * Parse a database timestamp.
 * `timestamp without time zone` values from Postgres are UTC wall-clock
 * strings with no offset. Treat those as UTC so local zones do not shift them.
 * @param {string|Date|number} value
 * @returns {Date}
 */
export function parseDbTimestamp(value) {
    if (value instanceof Date) return value
    if (typeof value === "number") return new Date(value)
    if (!value) return new Date(NaN)
    const text = String(value).trim()
    const naiveUtc = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(text)
        && !/(?:[zZ]|[+-]\d{2}:?\d{2})$/.test(text)
    if (naiveUtc) return new Date(`${text.replace(" ", "T")}Z`)
    return new Date(text)
}

/**
 * Format a date/datetime value as a relative time.
 * @param {string|Date|number} dateInput - ISO date string, Date instance, or timestamp
 * @returns {string} e.g. "剛剛", "5 分鐘前", "昨天", "2 週前"
 */
export function formatRelativeDate(dateInput) {
    const date = parseDbTimestamp(dateInput)
    const diffMs = Date.now() - date.getTime()
    if (!Number.isFinite(diffMs)) return ""
    if (diffMs < 60_000) return "剛剛"
    const minutes = Math.floor(diffMs / 60_000)
    if (minutes < 60) return `${minutes} 分鐘前`
    const hours = Math.floor(diffMs / 3_600_000)
    if (hours < 24) return `${hours} 小時前`
    const days = Math.floor(diffMs / 86_400_000)
    if (days === 1) return "昨天"
    if (days < 7) return `${days} 天前`
    if (days < 30) return `${Math.floor(days / 7)} 週前`
    return `${Math.floor(days / 30)} 個月前`
}

/**
 * Browser language tag, including region (for example en-US or zh-TW).
 * Falls back to the runtime default during server render.
 * @returns {string|undefined}
 */
function userLocale() {
    if (typeof navigator === "undefined") return undefined
    return navigator.language || navigator.languages?.[0] || undefined
}

/**
 * Format a date/datetime value as a local calendar date.
 * The pattern follows the user's locale and timezone.
 * @param {string|Date|number} dateInput
 * @returns {string} e.g. "2026/10/16" or "10/16/2026"
 */
export function formatCalendarDate(dateInput) {
    const date = parseDbTimestamp(dateInput)
    if (!Number.isFinite(date.getTime())) return ""
    return date.toLocaleDateString(userLocale())
}