// middleware/auth.global.js
export default defineNuxtRouteMiddleware(async (to, from) => {
    const supabase = useSupabaseClient();

    // Allow access to auth routes without checks
    const publicRoutes = ["/auth/login", "/auth/confirm", "/auth/callback"];
    if (publicRoutes.includes(to.path)) {
        return;
    }

    // Try to get the current user
    const { data: userData, error } = await supabase.auth.getUser();

    // If user is logged in, allow access
    if (userData?.user) {
        return;
    }

    // If no user, try to refresh the session once
    const { data: sessionData, error: refreshError } = await supabase.auth.refreshSession();

    if (sessionData?.user) {
        // Session refresh successful
        return;
    }

    // No valid session, redirect to login
    // Store the intended destination to redirect back after login
    return navigateTo({
        path: "/auth/login",
        query: { redirect: to.fullPath }
    });
});