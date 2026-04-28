import * as cheerio from "cheerio"

function sanitizeWikiContentHtml(rawHtml = "") {
    const $ = cheerio.load(rawHtml, null, false)

    $("script, style, object, embed, form, input, button, textarea, select, link, meta, noscript, svg, math").remove()
    $("a[href*='recentEdit.php']").closest("table").remove()
    $("td").filter((_, el) => $(el).text().includes("近期編輯")).closest("table").remove()

    $("*").each((_, el) => {
        const attribs = el.attribs || {}
        for (const [name, value] of Object.entries(attribs)) {
            const attr = name.toLowerCase()
            const attrValue = String(value || "").trim()

            if (attr.startsWith("on") || attr === "style" || attr === "srcdoc") {
                $(el).removeAttr(name)
                continue
            }

            if (attr === "href" || attr === "src") {
                const normalized = attrValue.replace(/\s+/g, "").toLowerCase()
                const isSafeUrl =
                    normalized.startsWith("http://") ||
                    normalized.startsWith("https://") ||
                    normalized.startsWith("//") ||
                    normalized.startsWith("/") ||
                    normalized.startsWith("#") ||
                    normalized.startsWith("mailto:") ||
                    normalized.startsWith("tel:")

                if (!isSafeUrl) {
                    $(el).removeAttr(name)
                }
            }
        }

        if (el.tagName?.toLowerCase() === "a") {
            $(el).attr("rel", "noopener noreferrer nofollow")
            const href = ($(el).attr("href") || "").trim()
            if (/^https?:\/\//i.test(href)) {
                $(el).attr("target", "_blank")
            } else {
                $(el).removeAttr("target")
            }
        }
    })

    return $.root().html() || ""
}

async function scrapeAnimeDetailByRefId(refId) {
    try {
        if (!isValidNumberString(refId)) {
            throw new Error(`Invalid reference ID: "${refId}" is not a valid number.`);
        }

        const { html } = await cfFetch(`${ACG_GAMER_BASE_URL}acgDetail.php?s=${refId}`);
        const $ = cheerio.load(html);

        const wikiContentHtml = $(".wikiContent").first().html() || ""
        return {
            wikiContentHtml: sanitizeWikiContentHtml(wikiContentHtml),
        }

    } catch (err) {
        console.error("Error scraping anime video detail:", err.message, err.stack);
        return null;
    }
}

export default defineEventHandler(async (event) => {
    const user = await authUser(event)

    const refId = getRouterParam(event, 'refId')

    try {
        const animeDetail = await scrapeAnimeDetailByRefId(refId)
        if (!animeDetail) {
            throw createError({ statusCode: 404, statusMessage: "Anime not found" })
        }

        return animeDetail
    } catch (error) {
        throw createError({ statusCode: 500, statusMessage: "Internal Server Error" })
    }
})