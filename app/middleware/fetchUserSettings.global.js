export default defineNuxtRouteMiddleware(async (to, from) => {
    const user = useSupabaseUser();
    const { fetchSettings } = useUserSettings();

    if (user.value) {
        await fetchSettings();
    }
});