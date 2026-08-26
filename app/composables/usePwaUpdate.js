/**
 * PWA update UX: no mid-session auto-reload.
 * - Shows when a new SW is waiting ($pwa.needRefresh)
 * - Applies on header download click, or automatically after a manual page refresh
 */
export function usePwaUpdate() {
    const nuxtApp = useNuxtApp()

    // $pwa is reactive(); nested refs are unwrapped
    const needRefresh = computed(() => Boolean(nuxtApp.$pwa?.needRefresh))

    async function applyUpdate() {
        if (!import.meta.client || !('serviceWorker' in navigator)) return

        const pwa = nuxtApp.$pwa
        let reloaded = false
        const reload = () => {
            if (reloaded) return
            reloaded = true
            window.location.reload()
        }

        // New SW takes control → reload (clientsClaim + skipWaiting)
        navigator.serviceWorker.addEventListener('controllerchange', reload)

        try {
            const registration = await navigator.serviceWorker.getRegistration()

            // Ensure waiting worker gets SKIP_WAITING even if workbox-window state is stale
            if (registration?.waiting) {
                registration.waiting.postMessage({ type: 'SKIP_WAITING' })
            }

            await pwa?.updateServiceWorker?.(true)
        } catch {
            // Fall through to timeout reload
        }

        // Fallback: controlling may not fire on some browsers / SW versions
        window.setTimeout(reload, 500)
    }

    if (import.meta.client) {
        const isManualReload = (() => {
            try {
                const nav = performance.getEntriesByType('navigation')[0]
                return nav?.type === 'reload'
            } catch {
                return false
            }
        })()

        let autoApplied = false
        watch(
            needRefresh,
            (needs) => {
                if (!needs || !isManualReload || autoApplied) return
                autoApplied = true
                applyUpdate()
            },
            { immediate: true },
        )
    }

    return { needRefresh, applyUpdate }
}
