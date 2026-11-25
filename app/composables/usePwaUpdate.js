/**
 * PWA update UX: no mid-session auto-reload.
 * - Shows when a new SW is waiting ($pwa.needRefresh)
 * - Applies on header download click, or automatically after a manual page refresh
 */
export function usePwaUpdate() {
    const nuxtApp = useNuxtApp()
    const { activeCount } = useOfflineDownloadQueue()
    const needRefresh = computed(() => Boolean(nuxtApp.$pwa?.needRefresh))

    async function applyUpdate() {
        if (!import.meta.client || !('serviceWorker' in navigator)) return
        if (activeCount.value > 0) return
        // One reload per update — stops iOS double-reload / module-abort loops
        if (sessionStorage.getItem('pwa-upd')) return
        sessionStorage.setItem('pwa-upd', '1')

        let done = false
        const reload = () => {
            if (done) return
            done = true
            window.location.reload()
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
        watch(needRefresh, (v) => { if (!v) sessionStorage.removeItem('pwa-upd') })

        const isManualReload = performance.getEntriesByType?.('navigation')?.[0]?.type === 'reload'
        let autoApplied = false
        watch(needRefresh, (needs) => {
            if (!needs || !isManualReload || autoApplied || activeCount.value > 0) return
            if (sessionStorage.getItem('pwa-upd')) return
            autoApplied = true
            applyUpdate()
        }, { immediate: true })
    }

    return { needRefresh, applyUpdate }
}
