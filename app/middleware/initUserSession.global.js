/**
 * Global middleware: session gate, user settings, admin role, status WebSocket.
 * Access rules live on pages via definePageMeta ({ public, publicSsr, offlineAccess, offlineOnly }).
 */

export default defineNuxtRouteMiddleware(async (to, _from) => {
    const path = (to.path || '/').replace(/\/$/, '') || '/'
    const offline = import.meta.client && !navigator.onLine

    if (to.meta.offlineOnly && !offline) return navigateTo('/')

    const user = useSupabaseUser()
    const { mark, wasSignedIn } = useOfflineAuthCache()

    if (user.value && import.meta.client) mark()

    const loggedIn = Boolean(user.value) || (offline && wasSignedIn())

    if (!loggedIn) {
        if (path === '/') return navigateTo('/welcome')
        if (import.meta.server && to.meta.publicSsr) return

        if (!to.meta.public) {
            if (offline) {
                if (!to.meta.offlineOnly) return navigateTo('/offline')
                return
            }
            const redirectInfo = useSupabaseCookieRedirect()
            redirectInfo.path.value = to.fullPath
            return navigateTo('/login')
        }
        return
    }

    if (import.meta.server) return

    if (offline) {
        if (!to.meta.offlineAccess) return navigateTo('/offline')
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
