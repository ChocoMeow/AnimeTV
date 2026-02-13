/**
 * Shared admin role state. Load once (e.g. with user settings), then reuse in middleware and header.
 * - isAdmin: null = not loaded, true/false = loaded
 * - fetchAdminRole(): call API once and cache result (no-op on server)
 * - clearAdmin(): call on sign out so next login re-checks
 */
export function useAdmin() {
    const user = useSupabaseUser()
    const isAdmin = useState('isAdmin', () => null)

    async function fetchAdminRole() {
        if (!user.value) {
            isAdmin.value = null
            return
        }
        if (import.meta.server) return
        // Already loaded this session — avoid calling the API again
        if (isAdmin.value !== null) return
        try {
            await $fetch('/api/admin/check', { credentials: 'include' })
            isAdmin.value = true
        } catch {
            isAdmin.value = false
        }
    }

    function clearAdmin() {
        isAdmin.value = null
    }

    watch(user, (u) => {
        if (!u) isAdmin.value = null
    })

    return {
        isAdmin: readonly(isAdmin),
        fetchAdminRole,
        clearAdmin,
    }
}
