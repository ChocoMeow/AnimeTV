/**
 * Global middleware: session gate, user settings, admin role, status WebSocket.
 */

export default defineNuxtRouteMiddleware(async (to, _from) => {
    const path = (to.path || '/').replace(/\/$/, '') || '/'
    const isLoginPage = path === '/login'

    if (import.meta.server) {
        return
    }

    if (!navigator.onLine) {
        if (!path.startsWith('/offline')) return navigateTo('/offline')
        return
    }

    const user = useSupabaseUser()
    if (!user.value) {
        if (isLoginPage) return
        return navigateTo('/login')
    }

    const { fetchSettings, settingsLoaded, userSettings } = useUserSettings()
    const { initialize: initializeStatus } = useUserStatus()
    const { fetchAdminRole } = useAdmin()

    if (!settingsLoaded.value && navigator.onLine) {
        await fetchSettings()
        await fetchAdminRole()
    }

    if (settingsLoaded.value && userSettings.value?.id && navigator.onLine) {
        await nextTick()
        initializeStatus()
    }
})
