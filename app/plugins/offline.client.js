/**
 * Client offline lifecycle:
 * - "was signed in" flag for PWA offline gates (no tokens)
 * - mid-session airplane mode → /offline
 * - push pending IndexedDB watch history when back online
 */
export default defineNuxtPlugin(() => {
    const user = useSupabaseUser()
    const client = useSupabaseClient()
    const router = useRouter()
    const { mark, clear, hydrate } = useOfflineAuthCache()
    const { sync } = useOfflineWatchHistory()

    hydrate()

    watch(user, (next) => {
        if (next) mark()
    }, { immediate: true })

    client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT' && navigator.onLine) clear()
    })

    window.addEventListener('offline', () => {
        const route = router.currentRoute.value
        if (route.meta?.offlineAccess) return
        const path = (route.path || '/').replace(/\/$/, '') || '/'
        if (path === '/offline') return
        router.replace('/offline')
    })

    const syncWatchHistory = () => {
        if (!navigator.onLine || !user.value) return
        sync(client)
    }
    watch(user, syncWatchHistory, { immediate: true })
    window.addEventListener('online', syncWatchHistory)
})
