import { serverSupabaseUser } from "#supabase/server"

export async function authUser(event) {
    const user = await serverSupabaseUser(event)

    if (!user) {
        throw createError({ statusCode: 403, statusMessage: "Unauthorized" })
    }

    return user;
}