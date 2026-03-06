import { serverSupabaseClient } from '#supabase/server'

/**
 * Issues a short-lived (30s), single-use WebSocket auth ticket.
 * The real access token never leaves the server — only the opaque ticket ID is returned to the client.
 */
export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)

    const { data: { session } } = await client.auth.getSession()
    if (!session?.access_token) {
        throw createError({ statusCode: 401, statusMessage: 'No active session' })
    }

    const userId = user.id || user.sub
    const ticket = createWsTicket(userId, session.access_token)

    return { ticket }
})
