// middleware/auth.global.js
export default defineNuxtRouteMiddleware((to, from) => {
    // Allow access to auth routes without checks
    const publicRoutes = ["/auth/login", "/auth/confirm", "/auth/callback"]
    if (publicRoutes.includes(to.path)) {
        return
    }

    const user = useSupabaseUser()

    if (!user.value) {
        return navigateTo({
            path: "/auth/login",
            query: { redirect: to.fullPath },
        })
    }
})
