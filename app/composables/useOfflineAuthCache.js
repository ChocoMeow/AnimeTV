/**
 * Offline route gate only. Stores a boolean flag — never tokens, email, or profile.
 * Supabase owns the real session; this only remembers "had signed in" for PWA offline.
 */

const KEY = 'app:offline-signed-in'

export function useOfflineAuthCache() {
    function hydrate() {
        if (!import.meta.client) return
        try {
            active.value = localStorage.getItem(KEY) === '1'
        } catch {
            active.value = false
        }
    }

    function mark() {
        active.value = true
        if (!import.meta.client) return
        try {
            localStorage.setItem(KEY, '1')
        } catch {
            /* private mode / quota */
        }
    }

    function clear() {
        active.value = false
        if (!import.meta.client) return
        try {
            localStorage.removeItem(KEY)
        } catch {
            /* ignore */
        }
    }

    function wasSignedIn() {
        if (import.meta.client && !active.value) hydrate()
        return active.value
    }

    return { active, hydrate, mark, clear, wasSignedIn }
}
