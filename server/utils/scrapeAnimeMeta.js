import * as cheerio from 'cheerio'

export const normalizeUserRating = (userRating) => {
    if (!userRating) return { score: '0.0', votes: 0 }
    const raw = Number(userRating.score ?? 0) || 0
    return {
        score: (Math.round(raw * 10) / 10).toFixed(1),
        votes: Number(String(userRating.count ?? userRating.votes ?? 0).replace(/[^\d]/g, '')) || 0,
    }
}

export const parsePremiereDate = (value) => {
    if (!value) return null
    const str = String(value)
    const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
    if (iso) return iso[0]
    const slash = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/)
    if (slash) return `${slash[1]}-${slash[2].padStart(2, '0')}-${slash[3].padStart(2, '0')}`
    return null
}

export async function scrapeAnimeDetailByRefId(refId) {
    if (!isValidNumberString(refId)) throw new Error(`Invalid reference ID: "${refId}"`)

    try {
        const { html } = await cfFetch(`${GAMER_BASE_URL}animeRef.php?sn=${refId}`)
        const $ = cheerio.load(html)
        const get = (sel, attr = null) => {
            const el = $(sel)
            return attr ? el.attr(attr)?.trim() || null : el.text().trim() || null
        }

        const title = get('.data-file img', 'alt')
        if (!title) {
            console.error('No title found for refId:', refId)
            return null
        }

        const premiereDate = get('.type-list li:nth-child(1) .content')
        const rawRelatedAnime = $('.old_list .anime_slider .theme-list-main')
            .map((_, el) => {
                const $el = $(el)
                const href = $el.attr('href') || ''
                return {
                    refId: href.match(/sn=(\d+)/)?.[1] || null,
                    image: $el.find('.theme-img').attr('data-src')?.trim() || null,
                    title: $el.find('.theme-name').text().trim() || null,
                    year: $el.find('.theme-time').text().trim() || null,
                    episodes: $el.find('.theme-number').text().trim() || null,
                    views: $el.find('.show-view-number p').text().trim() || null,
                }
            })
            .get()

        const [relatedAnime, mainMatchRow] = await Promise.all([
            matchAnime(rawRelatedAnime),
            matchAnime([{ refId, title, year: premiereDate }]).then((r) => r[0] ?? null),
        ])

        return {
            refId,
            detailId: get('.data .data-intro .link-button', 'href')?.match(/s=(\d+)/)?.[1] || null,
            title,
            description: get('.data .data-intro p'),
            views: get('.anime-title .anime_name .newanime-count span'),
            image: get('.data .data-img', 'data-src'),
            premiereDate,
            director: get('.type-list li:nth-child(2) .content'),
            distributor: get('.type-list li:nth-child(3) .content'),
            productionCompany: get('.type-list li:nth-child(4) .content'),
            tags: $('.type-list .tag-list li').map((_, tag) => $(tag).text().trim()).get(),
            userRating: {
                score: get('.score-overall-number'),
                count: get('.score-overall-people')?.replace('人評價', '') || null,
            },
            relatedAnime,
            videoId: mainMatchRow?.matchedVideo?.id ?? null,
            season: mainMatchRow?.matchedVideo?.season ?? null,
        }
    } catch (err) {
        console.error('Error scraping anime detail:', err.message)
        return null
    }
}

export function buildAnimeMetaPayload(scraped) {
    const { score, votes } = normalizeUserRating(scraped.userRating)
    return {
        title: scraped.title,
        description: scraped.description,
        thumbnail: scraped.image,
        premiere_date: parsePremiereDate(scraped.premiereDate),
        director: scraped.director,
        distributor: scraped.distributor,
        production_company: scraped.productionCompany,
        tags: scraped.tags || [],
        views: parseViews(scraped.views),
        score,
        votes,
        related_anime_source_ids: (scraped.relatedAnime || []).map((a) => a.refId).filter(Boolean),
        source_id: scraped.refId,
        source_details_id: scraped.detailId,
        video_id: scraped.videoId || null,
        season: scraped.season || null,
    }
}
