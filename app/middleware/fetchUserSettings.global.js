export default defineNuxtRouteMiddleware(async (to, from) => {
    const userSettings = useUserSettings()

    // Skip if settings are already loaded
    if (userSettings.settingsLoaded.value) {
        return
    }

    // Only fetch settings if user is logged in
    const user = useSupabaseUser()
    if (user.value) {
        await userSettings.fetchSettings()
        // Load admin role once so middleware/header can use cached value
        const { fetchAdminRole } = useAdmin()
        await fetchAdminRole()
    }
})
