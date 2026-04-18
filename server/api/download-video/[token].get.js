function videoCookieC(rawSetCookieHeader) {
    if (!rawSetCookieHeader) return ""
    let finalCookie = ""
    const baseCookies = rawSetCookieHeader.split(",")
    baseCookies.forEach((cookieString) => {
        const parts = cookieString.trim().split(";")[0].split("=")
        const key = parts[0]
        const value = parts[1]
        if (key === "e" || key === "p" || key === "h" || key.startsWith("_ga")) {
            finalCookie += `${key}=${value}; `
        }
    })
    return finalCookie.replace(/;\s*$/, "")
}

export default defineEventHandler(async (event) => {
    await authUser(event)
    const { token } = event.context.params

    try {
        const response = await fetch("https://v.anime1.me/api", {
            method: "POST",
            headers: {
                accept: "*/*",
                "content-type": "application/x-www-form-urlencoded",
            },
            body: `d=${token}`,
        })

        if (!response.ok) {
            throw createError({ statusCode: response.status, statusMessage: "Failed to fetch video source" })
        }

        const setCookieHeader = response.headers.get("set-cookie")
        const videoCookie = videoCookieC(setCookieHeader)
        const result = await response.json()
        if (!result?.s?.length) throw createError({ statusCode: 404, statusMessage: "No available source" })

        const raw = result.s[0].src
        const finalUrl = raw.startsWith("http") ? raw : `https:${raw}`
        const isM3u8 = /\.m3u8(\?|$)/i.test(finalUrl) || finalUrl.toLowerCase().includes("m3u8")

        if (isM3u8) {
            return {
                kind: "hls",
                playlistUrl: `/api/proxy-video?url=${encodeURIComponent(finalUrl)}&cookie=${encodeURIComponent(videoCookie)}`,
            }
        }

        return {
            kind: "mp4",
            downloadUrl: `/api/download-proxy?url=${encodeURIComponent(finalUrl)}&cookie=${encodeURIComponent(videoCookie)}`,
        }
    } catch (err) {
        console.error("download-video source resolve failed:", err)
        return {
            error: err?.statusMessage || err?.message || "Failed to resolve download source",
        }
    }
})
