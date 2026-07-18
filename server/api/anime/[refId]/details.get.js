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
        throw createError({ statusCode: 500, statusMessage: 'Internal Server Error' })
    }
})
