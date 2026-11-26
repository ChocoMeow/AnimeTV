/**
 * Global route gate: offline access, auth, settings, admin, presence.
 * Page flags via definePageMeta: { public, publicSsr, offlineAccess, offlineOnly }.
 * Settings/admin/presence load in the background so they do not block first paint.
 */
export default defineNuxtRouteMiddleware(async (to) => {
    const path = (to.path || '/').replace(/\/$/, '') || '/'
    const offline = import.meta.client && !navigator.onLine

    // Hard nav — /offline is a SW/prerender shell with no auth; soft nav reuses null user → /welcome
    if (to.meta.offlineOnly && import.meta.client && !offline) {
        location.replace('/')
        return abortNavigation()
    }
    if (offline && !to.meta.offlineAccess) {
        // Hard nav — client router would fetch /_payload.json and fail offline
        if (import.meta.client) {
            location.replace('/offline')
            return abortNavigation()
        }
        return navigateTo('/offline')
    }

    const user = useSupabaseUser()
    const { mark, clear, wasSignedIn } = useOfflineAuthCache()

    // Middleware can run before Supabase hydrates (pull-refresh / SW shell).
    let loggedIn = Boolean(user.value)
    if (!loggedIn && import.meta.client && wasSignedIn()) {
        if (offline) {
            loggedIn = true
        } else {
            const { data } = await useSupabaseClient().auth.getSession()
            loggedIn = Boolean(data.session)
            if (!loggedIn) clear()
        }
    }
    if (loggedIn && import.meta.client) mark()

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
