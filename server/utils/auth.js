import { serverSupabaseUser, serverSupabaseClient } from '#supabase/server'

export async function authUser(event) {
    const user = await serverSupabaseUser(event)

    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: 'Unauthorized - Please log in',
        })
    }

    return user
}

export async function authAdmin(event) {
    const user = await authUser(event)
    const client = await serverSupabaseClient(event)

    const userId = user.id || user.sub

    const { data, error } = await client.from('user_roles').select('role').eq('id', userId).maybeSingle()

    if (error) {
        console.error('Failed to check admin role:', error)
        throw createError({
            statusCode: 403,
            statusMessage: 'Failed to verify admin role',
        })
    }

    if (!data || data.role !== 'admin') {
        throw createError({
            statusCode: 403,
            statusMessage: 'Forbidden - Admins only',
        })
    }

    return user
}
