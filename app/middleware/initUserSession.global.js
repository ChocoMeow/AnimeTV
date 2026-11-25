/**
 * Global route gate: offline access, auth, settings, admin, presence.
 * Page flags via definePageMeta: { public, publicSsr, offlineAccess, offlineOnly }.
 * Settings/admin/presence load in the background so they do not block first paint.
 */
export default defineNuxtRouteMiddleware(async (to) => {
    const path = (to.path || '/').replace(/\/$/, '') || '/'
    const offline = import.meta.client && !navigator.onLine

    if (to.meta.offlineOnly && import.meta.client && !offline) return navigateTo('/')
    if (offline && !to.meta.offlineAccess) return navigateTo('/offline')

    const user = useSupabaseUser()
    const { mark, wasSignedIn } = useOfflineAuthCache()
    if (user.value && import.meta.client) mark()

    const loggedIn = Boolean(user.value) || (offline && wasSignedIn())

    if (!loggedIn) {
        // Prerender real HTML shells for the SW precache (avoid meta-refresh stubs).
        if (path === '/') {
            if (import.meta.prerender) return
            return navigateTo('/welcome')
        }
        if (import.meta.server && (to.meta.publicSsr || to.meta.offlineAccess)) return

        if (!to.meta.public) {
            if (offline) return
            const redirectInfo = useSupabaseCookieRedirect()
            redirectInfo.path.value = to.fullPath
            return navigateTo('/login')
        }
        return
    }

    if (import.meta.server || offline) return

    const { fetchSettings, settingsLoaded, userSettings } = useUserSettings()
    const { initialize: initializeStatus } = useUserStatus()
    const { isIncognito } = useIncognitoMode()
    const { fetchAdminRole } = useAdmin()

    function maybeInitPresence() {
        if (settingsLoaded.value && userSettings.value?.id && navigator.onLine && !isIncognito.value) {
            initializeStatus()
        }
    }

    if (!settingsLoaded.value && navigator.onLine) {
        // Fire-and-forget: do not block navigation / first paint on Supabase + admin check.
        Promise.all([fetchSettings(), fetchAdminRole()]).then(() => {
            maybeInitPresence()
        })
        return
    }

    maybeInitPresence()
})
