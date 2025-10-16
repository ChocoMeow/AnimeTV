export default defineNuxtRouteMiddleware(async (to, from) => {
    const supabase = useSupabaseClient()

    // Try to get a verified user
    let { data: userData, error } = await supabase.auth.getUser()

    // If no verified user, try to refresh the session once
    if (error || !userData?.user) {
        const { error: refreshError } = await supabase.auth.refreshSession()
        if (refreshError) {
            return navigateTo("/auth/login")
        }
        ; ({ data: userData, error } = await supabase.auth.getUser())
        if (error || !userData?.user) {
            return navigateTo("/auth/login")
        }
    }
})
