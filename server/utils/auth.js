import { serverSupabaseUser } from "#supabase/server"

export async function authUser(event) {
    const user = await serverSupabaseUser(event)

    if (!user) {
        throw createError({
            statusCode: 401,
            statusMessage: "Unauthorized - Please log in",
        })
    }

    return user
}
