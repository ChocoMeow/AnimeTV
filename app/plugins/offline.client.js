/**
 * Client offline lifecycle:
 * - "was signed in" flag for PWA offline gates
 * - airplane mode → /offline
 * - watch history sync every 2 min / on online
 */
export default defineNuxtPlugin(() => {
    const user = useSupabaseUser()
    const client = useSupabaseClient()
    const router = useRouter()
    const { mark, clear, hydrate } = useOfflineAuthCache()
    const { sync, startPeriodicSync } = useOfflineWatchHistory()

    hydrate()
    startPeriodicSync(client)

    watch(user, (next) => {
        if (!next) return
        mark()
        if (navigator.onLine) sync(client)
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
})
