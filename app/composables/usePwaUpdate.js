/**
 * PWA update prompt: apply on header click, or once after a manual refresh.
 * Single reload only — avoids iOS double-reload / module-abort loops.
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
        navigator.serviceWorker.addEventListener('controllerchange', reload, { once: true })

        try {
            const reg = await navigator.serviceWorker.getRegistration()
            reg?.waiting?.postMessage({ type: 'SKIP_WAITING' })
            await nuxtApp.$pwa?.updateServiceWorker?.(true)
        } catch { /* timeout fallback */ }

        setTimeout(() => { if (!done) reload() }, 1500)
    }

    if (import.meta.client) {
        const manualReload = performance.getEntriesByType?.('navigation')?.[0]?.type === 'reload'
        watch(needRefresh, (needs) => {
            if (!needs) {
                sessionStorage.removeItem(LOCK)
                return
            }
            if (manualReload && !activeCount.value && !sessionStorage.getItem(LOCK)) applyUpdate()
        }, { immediate: true })
    }

    return { needRefresh, applyUpdate }
}
