import http from "node:http"
import https from "node:https"
import { URL } from "node:url"

const httpAgent = new http.Agent({ keepAlive: true, timeout: 30000 })
const httpsAgent = new https.Agent({ keepAlive: true, timeout: 30000 })

export default defineEventHandler(async (event) => {
    await authUser(event)

    const { url, cookie } = getQuery(event)
    if (!url || !cookie) {
        return sendError(event, createError({ statusCode: 400, statusMessage: "Missing parameters" }))
    }

    const maxRedirects = 5

    const streamFile = async (target, redirects = 0) => {
        let u
        try {
            u = new URL(target)
        } catch {
            throw createError({ statusCode: 400, statusMessage: "Invalid URL" })
        }

        const client = u.protocol === "https:" ? https : http
        const agent = u.protocol === "https:" ? httpsAgent : httpAgent
        const referer = u.hostname.includes("anime1.me") ? "https://anime1.me/" : `${u.origin}/`

        await new Promise((resolve, reject) => {
            const req = client.request(
                {
                    hostname: u.hostname,
                    port: u.port || (u.protocol === "https:" ? 443 : 80),
                    path: u.pathname + u.search,
                    method: "GET",
                    agent,
                    timeout: 30000,
                    headers: {
                        Cookie: cookie,
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                        Accept: "*/*",
                        Connection: "keep-alive",
                        Referer: referer,
                    },
                },
                (res) => {
                    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                        res.destroy()
                        if (redirects >= maxRedirects) {
                            reject(createError({ statusCode: 508, statusMessage: "Too many redirects" }))
                            return
                        }
                        const next = new URL(res.headers.location, target).toString()
                        streamFile(next, redirects + 1).then(resolve).catch(reject)
                        return
                    }

                    if (res.statusCode >= 400) {
                        res.destroy()
                        reject(createError({ statusCode: res.statusCode, statusMessage: "Upstream download failed" }))
                        return
                    }

                    if (!event.node.res.headersSent) {
                        setResponseStatus(event, 200)
                        setResponseHeader(event, "Content-Type", res.headers["content-type"] || "video/mp4")
                        if (res.headers["content-length"]) {
                            setResponseHeader(event, "Content-Length", res.headers["content-length"])
                        }
                        setResponseHeader(event, "Cache-Control", "no-store")
                        setResponseHeader(event, "Access-Control-Allow-Origin", "*")
                    }

                    res.on("error", reject)
                    res.on("end", resolve)
                    res.pipe(event.node.res, { end: true })
                }
            )

            req.setTimeout(30000, () => req.destroy(new Error("Request timeout")))
            req.on("error", reject)
            req.end()
        })
    }

    try {
        await streamFile(String(url))
    } catch (err) {
        if (!event.node.res.headersSent) {
            return sendError(event, err?.statusCode ? err : createError({ statusCode: 502, statusMessage: err?.message || "Proxy error" }))
        }
    }
})
