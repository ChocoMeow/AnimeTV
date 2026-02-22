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