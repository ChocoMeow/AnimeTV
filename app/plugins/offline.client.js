/**
 * Offline lifecycle: auth flag, airplane → /offline, watch-history sync.
 * Hard-nav to /offline so the SW can serve the precached shell (no /_payload.json).
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
        if (router.currentRoute.value.meta?.offlineAccess) return
        location.replace('/offline')
    })
})
