const numberFormat = new Intl.NumberFormat("en-US")

export function formatViews(views) {
    if (views === null || views === undefined) return "0"

    const n = Number(views)
    if (Number.isNaN(n) || n < 0) return "0"

    // If value >= 10,000, show in 萬 unit (e.g. 27.9萬)
    if (n >= 10000) {
        const wanValue = Math.round(n / 10000)
        return `${numberFormat.format(wanValue)}萬`
    }

    // Format with thousands separators (e.g. 8,000)
    return numberFormat.format(n)
}
