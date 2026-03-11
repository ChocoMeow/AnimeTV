import { serverSupabaseClient } from '#supabase/server'

/**
 * Issues a short-lived (30s), single-use WebSocket auth ticket.
 * The real access token never leaves the server — only the opaque ticket ID is returned to the client.
 * Uses getSession() for the token and getUser(jwt) for a server-verified user (not session.user from cookies).
 */
export default defineEventHandler(async (event) => {
    const client = await serverSupabaseClient(event)
    const { data: { session } } = await client.auth.getSession()

    if (!session?.access_token) {
        throw createError({ statusCode: 401, statusMessage: 'No active session' })
    }

    const { data: { user }, error } = await client.auth.getUser(session.access_token)
    if (error || !user?.id) {
        throw createError({ statusCode: 401, statusMessage: 'Invalid or expired session' })
    }

    const ticket = createWsTicket(user.id, session.access_token)
    return { ticket }
})
