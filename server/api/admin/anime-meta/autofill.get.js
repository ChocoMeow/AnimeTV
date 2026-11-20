import { autofillAnimeMeta } from '~~/server/services/admin.service.js'
import { createLoggedError } from '~~/server/utils/logger'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const query = getQuery(event)
    const detailId = typeof query.detailId === 'string' ? query.detailId.trim() : ''

    if (!detailId) {
        throw createError({ statusCode: 400, statusMessage: 'detailId is required' })
    }

    try {
        return await autofillAnimeMeta(event, detailId)
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
