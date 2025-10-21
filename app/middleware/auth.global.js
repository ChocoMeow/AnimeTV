// middleware/auth.global.js
export default defineNuxtRouteMiddleware(async (to, from) => {
    // Allow access to auth routes without checks
    const publicRoutes = ["/auth/login", "/auth/confirm", "/auth/callback"]
    if (publicRoutes.includes(to.path)) {
        return
    }

    const client = useSupabaseClient();

    const { data: userData, error } = await client.auth.getUser();
    if (userData?.user) {
        return;
    }

    const { data: sessionData, error: refreshError } = await client.auth.refreshSession();
    if (sessionData?.user) {
        return;
    }

    return navigateTo({
        path: "/auth/login",
        query: { redirect: to.fullPath }
    });
})
