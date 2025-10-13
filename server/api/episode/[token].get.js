import { cfFetch } from "~~/server/utils/anime"

export default defineEventHandler(async (event) => {
    const { token } = event.context.params
    const encodedBody = `d=${token}`

    try {
        const { html, cookies } = await cfFetch("https://v.anime1.me/api", {
            method: "POST",
            postData: encodedBody
        })

        console.log(html, cookies)
        // Extract JSON from the HTML response
        let jsonText = html
        const preMatch = html.match(/<pre>(.*?)<\/pre>/s)
        if (preMatch) {
            jsonText = preMatch[1]
        }

        // Parse the JSON response
        let result
        try {
            result = JSON.parse(jsonText)
        } catch (parseError) {
            console.error("Failed to parse response:", jsonText)
            throw new Error("Invalid JSON response from server")
        }

        const data = {
            ...result,
            videoCookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ').replace(/;\s*$/, "")
        }
        console.log(data)
        return data
    } catch (err) {
        console.error("Error fetching video data:", err)
        return { error: err.message || "Failed to fetch video" }
    }
})


// Extract only specific video cookies (e, p, h, _ga)
function extractVideoCookies(cookies) {
    if (!cookies || !Array.isArray(cookies)) return ""

    let finalCookie = ""

    cookies.forEach((cookie) => {
        const key = cookie.name
        const value = cookie.value

        if (key === "e" || key === "p" || key === "h" || key.startsWith("_ga")) {
            finalCookie += `${key}=${value}; `
        }
    })
    return finalCookie.replace(/;\s*$/, "")
}
