import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'
import { createLoggedError, getRequestLogger } from '~~/server/utils/logger'

export async function authUser(event) {
    const user = await serverSupabaseUser(event)

    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized - Please log in',
        })
    }

    event.context.user = user
    return user
}

export async function authAdmin(event) {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)

    const userId = user.id || user.sub

    const { data, error } = await client.from('user_roles').select('role').eq('id', userId).maybeSingle()

    if (error) {
        throw createLoggedError(event, {
            statusCode: 403,
            statusMessage: 'Failed to verify admin role',
            err: error,
            context: { module: 'auth', stage: 'admin_role_check', userId },
        })
    }

    if (!data || data.role !== 'admin') {
        getRequestLogger(event).warn({ userId, module: 'auth' }, 'Non-admin attempted admin route')
        throw createError({
            statusCode: 403,
            statusMessage: 'Forbidden - Admins only',
        })
    }

    return user
}
