/** Push pending IndexedDB watch history to Supabase when the client is online. */

export default defineNuxtPlugin(() => {
    const client = useSupabaseClient()
    const user = useSupabaseUser()
    const { sync } = useOfflineWatchHistory()

    const run = () => {
        if (!navigator.onLine || !user.value) return
        sync(client)
    }

    watch(user, run, { immediate: true })
    window.addEventListener('online', run)
})