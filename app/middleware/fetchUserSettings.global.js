export default defineNuxtRouteMiddleware(async (to, from) => {
    const { fetchSettings, settingsLoaded } = useUserSettings();
    const { fetchSettings, settingsLoaded } = useUserSettings()

    // Skip if settings are already loaded
    if (settingsLoaded.value) {
        return;
    }

    // Only fetch settings if user is logged in
    const user = useSupabaseUser();
    if (user.value) {
        await fetchSettings();
    }
});