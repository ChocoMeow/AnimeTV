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
    const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
    if (!Number.isFinite(date.getTime())) return "00:00"
    const hours = date.getHours().toString().padStart(2, "0")
    const minutes = date.getMinutes().toString().padStart(2, "0")
    return `${hours}:${minutes}`
}
