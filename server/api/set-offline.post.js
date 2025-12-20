import { serverSupabaseClient } from '#supabase/server'

export default defineEventHandler(async (event) => {
    const user = await authUser(event)
    try {
        const client = await serverSupabaseClient(event)

        const statusData = {
            user_id: user.sub,
            status: "offline",
            last_seen: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            anime_ref_id: null,
            anime_title: null,
            anime_image: null,
            episode_number: null,
        }

        const { error } = await client
            .from('user_status')
            .upsert(statusData, { onConflict: 'user_id' })

        return { success: true }
    } catch (err) {
        return { success: false, error: 'Internal server error' }
    }
})
