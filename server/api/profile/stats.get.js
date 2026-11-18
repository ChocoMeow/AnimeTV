import { serverSupabaseClient } from '#supabase/server'
import { createLoggedError } from '~~/server/utils/logger'
import { getProfileStats } from '~~/server/services/profile.service.js'

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)
    const query = getQuery(event)
    const period = (query.period || 'week').toLowerCase()
    const userId = user.id || user.sub

    try {
        return await getProfileStats(client, userId, period)
    } catch (err) {
        throw createLoggedError(event, {
            statusCode: 500,
            statusMessage: 'Failed to load profile stats',
            err,
            context: { module: 'profile-stats' },
        })
    }
})
