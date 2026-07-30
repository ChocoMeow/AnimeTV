import { createLoggedError } from '~~/server/utils/logger'

export default defineEventHandler(async (event) => {
    await authUser(event)

    const refId = getRouterParam(event, 'refId')

    try {
        const scraped = await scrapeAcgDetail(refId, { includeWiki: true })
        if (!scraped) {
            throw createError({ statusCode: 404, statusMessage: 'Anime not found' })
        }

        return { wikiContentHtml: scraped.wikiContentHtml }
    } catch (error) {
        if (error?.statusCode) throw error
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Internal Server Error',
            err: error,
            context: { module: 'anime-details', refId },
        })
    }
})
