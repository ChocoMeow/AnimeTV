/**
 * Keep users on offline-capable routes when the network drops.
 * Complements middleware (covers mid-session airplane mode + SW-served home HTML).
 */

const OFFLINE_ALLOW = new Set(['/offline', '/offline-downloads'])

function pathAllowed(path) {
    const p = (path || '/').replace(/\/$/, '') || '/'
    if (OFFLINE_ALLOW.has(p)) return true
    if (p.startsWith('/anime/')) return true
    return false
}

export default defineNuxtPlugin((nuxtApp) => {
    const router = useRouter()

    function enforceOfflineRoute() {
        if (typeof navigator === 'undefined' || navigator.onLine) return
        const route = router.currentRoute.value
        if (route.meta?.offlineAccess || pathAllowed(route.path)) return
        if (route.path.replace(/\/$/, '') === '/offline') return
        return router.replace('/offline')
    }

    window.addEventListener('offline', () => {
        enforceOfflineRoute()
    })

    nuxtApp.hook('app:mounted', () => {
        enforceOfflineRoute()
    })

    router.afterEach(() => {
        enforceOfflineRoute()
    })
})
