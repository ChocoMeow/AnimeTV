export function isValidNumberString(str) {
    return /^[+-]?\d+(\.\d+)?$/.test(str);
}

/** Parse view count from text (e.g. "1.2萬" -> 12000, "1234" -> 1234). */
export function parseViews(viewsText) {
    if (!viewsText) return 0
    const text = String(viewsText).trim()

    if (text.includes("萬")) {
        const numeric = Number(text.replace("萬", "").replace(/[^\d.]/g, ""))
        return Number.isNaN(numeric) ? 0 : Math.round(numeric * 10000)
    }

    const numeric = Number(text.replace(/[^\d]/g, ""))
    return Number.isNaN(numeric) ? 0 : numeric
}

/** Normalize premiere date strings to yyyy/mm (year + month). Handles ISO yyyy-mm-dd and yyyy/mm[/dd]. */
export function toYearMonthSlash(value) {
    if (value == null || value === "") return null
    const s = String(value).trim()
    const iso = s.match(/^(\d{4})-(\d{1,2})(?:-(\d{1,2}))?$/)
    if (iso) return `${iso[1]}/${iso[2].padStart(2, "0")}`
    const slash = s.match(/^(\d{4})\/(\d{1,2})(?:\/(\d{1,2}))?$/)
    if (slash) return `${slash[1]}/${slash[2].padStart(2, "0")}`
    return s
}