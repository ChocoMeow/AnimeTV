import { createLoggedError } from '~~/server/utils/logger'
import { getAnimeWiki } from '~~/server/services/animeMeta.service.js'

export default defineEventHandler(async (event) => {
    await authUser(event)

    const refId = getRouterParam(event, 'refId')

    try {
        return await getAnimeWiki(refId)
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
