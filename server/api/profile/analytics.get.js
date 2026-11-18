import { serverSupabaseClient } from '#supabase/server'
import { createLoggedError } from '~~/server/utils/logger'
import { getProfileAnalytics } from '~~/server/services/profile.service.js'

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const query = getQuery(event)
    const userId = user.id || user.sub

    try {
        return await getProfileAnalytics(client, userId, query.tz)
    } catch (err) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to load profile analytics',
            err,
            context: { module: 'profile-analytics' },
        })
    }
})
