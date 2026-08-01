import { serverSupabaseClient } from '#supabase/server'
import { CUSTOM_SOURCE_ID_MIN } from '~~/shared/global'
import { createLoggedError, moduleLogger } from '~~/server/utils/logger'

const log = moduleLogger('admin-anime-meta-autofill')

/** Next custom source_id (>= CUSTOM_SOURCE_ID_MIN). Avoids full-table scan of Bahamut SNs. */
async function nextSourceId(client) {
    const { data, error } = await client
        .from('anime_meta')
        .select('source_id')
        .gte('source_id', CUSTOM_SOURCE_ID_MIN)

    if (error) {
        log.error({ err: error }, 'Failed to fetch max source_id')
        return String(CUSTOM_SOURCE_ID_MIN)
    }

    let maxId = CUSTOM_SOURCE_ID_MIN - 1
    for (const row of data || []) {
        const n = Number(row.source_id)
        if (n > maxId) maxId = n
    }
    return String(maxId + 1)
}

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const query = getQuery(event)
    const detailId = typeof query.detailId === 'string' ? query.detailId.trim() : ''

    if (!detailId) {
        throw createError({ statusCode: 400, statusMessage: 'detailId is required' })
    }

    try {
        // Skip wiki sanitize — largest CPU cost when scraping.
        const scraped = await scrapeAcgDetail(detailId, { includeWiki: false })
        if (!scraped?.title) {
            throw createError({ statusCode: 404, statusMessage: 'Anime details not found' })
        }

        const { wikiContentHtml: _wiki, ...data } = scraped

        const client = await serverSupabaseClient(event)
        const [sourceId, matched] = await Promise.all([
            nextSourceId(client),
            matchAnime([{
                refId: detailId,
                title: data.title,
                year: data.premiere_date?.slice(0, 4) || data.premiere_date,
            }]).then((rows) => rows[0] ?? null),
        ])

        if (sourceId) data.source_id = sourceId
        data.video_id = matched?.matchedVideo?.id ?? null
        data.season = matched?.matchedVideo?.season ?? null

        return data
    } catch (err) {
        if (err?.statusCode) throw err
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to scrape anime details',
            err,
            context: { module: 'admin-anime-meta-autofill' },
        })
    }
})
