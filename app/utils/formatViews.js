export function formatViews(views) {
    if (!views) return "0"

    const n = Number(views) || 0

    // If value >= 10,000, show in 萬 unit
    if (n >= 10000) {
        const wanValue = Math.round(n / 10000)
        const formattedWan = new Intl.NumberFormat("en-US").format(wanValue)
        return `${formattedWan}萬`
    }

    // If value >= 1,000, add thousands separators (e.g. 1,234)
    if (n >= 1000) {
        return new Intl.NumberFormat("en-US").format(n)
    }

    return n.toString()
}
