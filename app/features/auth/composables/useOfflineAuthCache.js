/**
 * Boolean "had signed in" flag for PWA offline gates.
 * Never stores tokens, email, or profile — Supabase owns the session.
 */
const KEY = 'app:offline-signed-in'

function readFlag() {
    if (!import.meta.client) return false
    try {
        return localStorage.getItem(KEY) === '1'
    } catch {
        return false
    }
}

function writeFlag(on) {
    if (!import.meta.client) return
    try {
        if (on) localStorage.setItem(KEY, '1')
        else localStorage.removeItem(KEY)
    } catch {
        /* private mode / quota */
    }
}

export function useOfflineAuthCache() {
    const signedIn = useState('offline-signed-in', () => false)

    function hydrate() {
        signedIn.value = readFlag()
    }

    function mark() {
        signedIn.value = true
        writeFlag(true)
    }

    function clear() {
        signedIn.value = false
        writeFlag(false)
    }

    function wasSignedIn() {
        if (import.meta.client && !signedIn.value) hydrate()
        return signedIn.value
    }

    return { signedIn, hydrate, mark, clear, wasSignedIn }
}
