/**
 * PWA update: apply from header only.
 * Auto-apply on reload looped with pull-to-refresh + false-positive needRefresh.
 */
export function usePwaUpdate() {
    const nuxtApp = useNuxtApp()
    const { activeCount } = useOfflineDownloadQueue()
    const needRefresh = computed(() => Boolean(nuxtApp.$pwa?.needRefresh))
    const LOCK = 'pwa-upd'

    async function applyUpdate() {
        if (!import.meta.client || !('serviceWorker' in navigator)) return
        if (activeCount.value || sessionStorage.getItem(LOCK)) return
        sessionStorage.setItem(LOCK, '1')

        let done = false
        const reload = () => {
            if (done) return
            done = true
            location.reload()
        }

        try {
            const reg = await navigator.serviceWorker.getRegistration()
            if (!reg?.waiting) {
                sessionStorage.removeItem(LOCK)
                return
            }
            navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true })
            reg.waiting.postMessage({ type: 'SKIP_WAITING' })
            await nuxtApp.$pwa?.updateServiceWorker?.(true)
            setTimeout(() => { if (!done) reload() }, 1500)
        } catch {
            sessionStorage.removeItem(LOCK)
        }
    }

    if (import.meta.client) {
        watch(needRefresh, (needs) => {
            if (!needs) sessionStorage.removeItem(LOCK)
        }, { immediate: true })
    }

    return { needRefresh, applyUpdate }
}
