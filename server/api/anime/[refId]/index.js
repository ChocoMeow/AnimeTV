import * as cheerio from "cheerio"
import { serverSupabaseClient } from "#supabase/server"

async function fetchEpisodeTokens(categoryId) {
    const episodes = {};
    let seriesTitle = "";
    let nextPageUrl = `${ANIME1_BASE_URL}?cat=${categoryId}`;

    try {
        while (nextPageUrl) {
            // Fetch and parse HTML
            const { html } = await cfFetch(nextPageUrl);
            const $ = cheerio.load(html);

            // Extract series title once
            if (!seriesTitle) {
                seriesTitle = $(".page-title").text().trim() || "Unknown Series";
            }

            // Process articles
            $("article").each((index, element) => {
                const fullTitle = $(element).find("h2.entry-title a").text().trim();
                const token = $(element).find(".video-js").attr("data-apireq");

                // Skip invalid articles
                if (!fullTitle || !token) {
                    console.warn(`Skipping article ${index} on page ${nextPageUrl}: Missing title or token`, { fullTitle, token });
                    return;
                }

                // Match [number] or [number+number+...]
                const match = fullTitle.match(/\[(\d+(?:\+\d+)*)\]/);
                if (!match) {
                    console.warn(`Skipping article ${index} on page ${nextPageUrl}: No episode number found`, { fullTitle });
                    return;
                }

                // Split and clean episode numbers (e.g., "00+01" -> ["0", "1"])
                const episodeNumbers = match[1].split("+").map(num => {
                    const numValue = Number(num.replace(/^0+(?=\d)/, ""));
                    return String(numValue); // Ensure "0" stays "0"
                });

                // Map each episode to the token
                episodeNumbers.forEach(episode => {
                    if (episodes[episode] && episodes[episode] !== token) {
                        console.warn(`Conflict for episode ${episode} on page ${nextPageUrl}:`, {
                            oldToken: episodes[episode],
                            newToken: token,
                            title: fullTitle
                        });
                    }
                    episodes[episode] = token;
                });
            });

            // Get next page URL
            const prevLink = $(".nav-previous a").attr("href");
            nextPageUrl = prevLink || null;
        }

        return {
            categoryId,
            title: seriesTitle,
            episodes
        };
    } catch (error) {
        console.error(`Error fetching episode data for category ${categoryId}:`, error);
        return {
            categoryId,
            title: seriesTitle,
            episodes
        };
    }
}

async function scrapeAnimeDetailByRefId(refId) {
    try {
        if (!isValidNumberString(refId)) {
            throw new Error(`Invalid reference ID: "${refId}" is not a valid number.`);
        }

        const { html } = await cfFetch(`${GAMER_BASE_URL}animeRef.php?sn=${refId}`)
        const $ = cheerio.load(html)

        const getText = (selector) => $(selector).text().trim() || null
        const getAttr = (selector, attr) => $(selector).attr(attr)?.trim() || null

        const title = getAttr(".data-file img", "alt")
        if (!title) {
            console.error("No title found, cannot match anime")
            return null
        }

        const description = getText(".data .data-intro p")
        const views = getText(".anime-title .anime_name .newanime-count span")
        const image = getAttr(".data .data-img", "data-src")
        const premiereDate = getText(".type-list li:nth-child(1) .content")
        const director = getText(".type-list li:nth-child(2) .content")
        const distributor = getText(".type-list li:nth-child(3) .content")
        const productionCompany = getText(".type-list li:nth-child(4) .content")
        const detailId = getAttr(".data .data-intro .link-button", "href")?.match(/s=(\d+)/)?.[1] || null

        const userRating = {
            score: getText(".score-overall-number"),
            count: getText(".score-overall-people")?.replace("人評價", "") || null,
        }
        const tags = $(".type-list .tag-list li")
            .map((_, tag) => $(tag).text().trim())
            .get()

        const rawRelatedAnime = $(".old_list .anime_slider .theme-list-main")
            .map((_, movie) => {
                const $movie = $(movie)
                const href = $movie.attr("href") || ""
                const refId = href.match(/sn=(\d+)/)?.[1] || null

                return {
                    refId,
                    image: $movie.find(".theme-img").attr("data-src")?.trim() || null,
                    title: $movie.find(".theme-name").text().trim() || null,
                    year: $movie.find(".theme-time").text().trim() || null,
                    episodes: $movie.find(".theme-number").text().trim() || null,
                    views: $movie.find(".show-view-number p").text().trim() || null,
                }
            })
            .get()

        // Match anime to get video details
        const relatedAnime = await matchAnime(rawRelatedAnime)
        const matchedVideo = await matchAnime([{ refId, title, year: premiereDate }]).then((results) => results[0].matchedVideo)
        const episodes = await fetchEpisodeTokens(matchedVideo.id).then((data) => data.episodes)

        return {
            refId,
            detailId,
            title,
            description,
            views,
            episodes,
            image,
            premiereDate,
            director,
            distributor,
            productionCompany,
            tags,
            userRating,
            relatedAnime,
        }
    } catch (err) {
        console.error("Error scraping anime video detail:", err.message, err.stack)
        return null
    }
}

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const refId = getRouterParam(event, "refId")

    try {
        const animeDetail = await scrapeAnimeDetailByRefId(refId)
        if (!animeDetail) {
            throw createError({ statusCode: 404, statusMessage: "Anime not found" })
        }

        const { data } = await client.from("favorites").select("id").eq("anime_ref_id", animeDetail.refId).single()
        return { ...animeDetail, isFavorite: data !== null }

    } catch (error) {
        throw createError({ statusCode: 500, statusMessage: "Internal Server Error" })
    }
})