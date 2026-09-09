/**
 * Session-scoped Incognito mode.
 * When enabled: no watch/search history writes, and presence is not shared with friends.
 * Persists for the browser tab via sessionStorage (clears when the tab/window closes).
 */

const INCOGNITO_KEY = 'incognito_mode'

function readStored() {
    if (!import.meta.client || typeof sessionStorage === 'undefined') return false
    return sessionStorage.getItem(INCOGNITO_KEY) === '1'
}

export function useIncognitoMode() {
    const isIncognito = useState('incognito-mode', () => false)
    const { showToast } = useToast()

    // Hydrate once on the client (middleware / first composable use)
    if (import.meta.client && !isIncognito.value && readStored()) {
        isIncognito.value = true
    }

    /**
     * Enable or disable Incognito mode.
     * Enabling goes offline first so friends stop seeing activity, then blocks further presence.
     * Disabling resumes normal status tracking.
     */
    function setIncognito(enabled) {
        const next = !!enabled
        if (next === isIncognito.value) return

        const { setOffline, initialize } = useUserStatus()

        if (next) {
            // Flush offline while tracking is still allowed, then lock the flag
            setOffline()
            isIncognito.value = true
            if (import.meta.client) sessionStorage.setItem(INCOGNITO_KEY, '1')
        } else {
            isIncognito.value = false
            if (import.meta.client) sessionStorage.removeItem(INCOGNITO_KEY)
            initialize()
        }
    }

    function toggleIncognito() {
        const next = !isIncognito.value
        setIncognito(next)
        showToast(next ? '無痕模式已開啟' : '無痕模式已關閉', next ? 'success' : 'info')
    }

    return {
        isIncognito: readonly(isIncognito),
        setIncognito,
        toggleIncognito,
    }
}
