/**
 * Global middleware to initialize user session
 * - Fetches user settings when user is logged in
 * - Initializes WebSocket connection for status tracking
 */
export default defineNuxtRouteMiddleware(async (to, from) => {
    const { fetchSettings, settingsLoaded, userSettings } = useUserSettings()
    const { initialize: initializeStatus } = useUserStatus()

    // Only run on client side
    if (import.meta.server) {
        return
    }

    // Check if user is logged in
    const user = useSupabaseUser()
    if (!user.value) {
        return
    }

    // Fetch user settings if not already loaded
    if (!settingsLoaded.value) {
        await fetchSettings()
    }

    // Initialize WebSocket connection for status tracking
    // Only start if user settings are loaded and user ID is available
    if (settingsLoaded.value && userSettings.value?.id) {
        // Use nextTick to ensure composable is fully ready
        await nextTick()
        initializeStatus()
    }
})
