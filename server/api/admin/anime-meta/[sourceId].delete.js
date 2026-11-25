import { deleteAnimeMeta } from '~~/server/services/admin.service.js'

export default defineEventHandler(async (event) => {
    await authAdmin(event)

    const { sourceId } = getRouterParams(event)
    if (!sourceId) throw createError({ statusCode: 400, statusMessage: 'Missing sourceId parameter' })

    return deleteAnimeMeta(event, sourceId)
})
