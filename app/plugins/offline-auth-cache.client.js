/** Sync offline signed-in flag with Supabase. Keep flag on offline SIGNED_OUT (failed refresh). */

export default defineNuxtPlugin(() => {
    const user = useSupabaseUser()
    const client = useSupabaseClient()
    const { mark, clear, hydrate } = useOfflineAuthCache()

    hydrate()

    watch(user, (next) => {
        if (next) mark()
    }, { immediate: true })

    client.auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_OUT' && navigator.onLine) clear()
    })
})
