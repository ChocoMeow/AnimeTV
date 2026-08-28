/**
 * Global middleware: session gate, user settings, admin role, status WebSocket.
 */

export default defineNuxtRouteMiddleware(async (to, _from) => {
    const path = (to.path || '/').replace(/\/$/, '') || '/'
    const isPublicPage = path === '/login' || path === '/welcome' || path === '/terms' || path === '/privacy'

    const user = useSupabaseUser()

    if (!user.value) {
        if (path === '/') {
            return navigateTo('/welcome')
        }
        if (!isPublicPage) {
            const redirectInfo = useSupabaseCookieRedirect()
            redirectInfo.path.value = to.fullPath
            return navigateTo('/login')
        }
        return navigateTo('/welcome')
    }

    if (import.meta.server) {
        return
    }

    if (!navigator.onLine) {
        if (!path.startsWith('/offline')) return navigateTo('/offline')
        return
    }

    const { fetchSettings, settingsLoaded, userSettings } = useUserSettings()
    const { initialize: initializeStatus } = useUserStatus()
    const { isIncognito } = useIncognitoMode()
    const { fetchAdminRole } = useAdmin()

    if (!settingsLoaded.value && navigator.onLine) {
        await fetchSettings()
        await fetchAdminRole()
    }

    if (settingsLoaded.value && userSettings.value?.id && navigator.onLine && !isIncognito.value) {
        await nextTick()
        initializeStatus()
    }
})
