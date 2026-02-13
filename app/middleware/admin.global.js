/**
 * Protects /admin: only users with admin role may access. Others get 403 error page.
 * On server: always calls API. On client: uses cached isAdmin from useAdmin (loaded once with user settings).
 */
export default defineNuxtRouteMiddleware(async (to) => {
    if (to.path !== '/admin') return

    if (import.meta.client) {
        const { isAdmin, fetchAdminRole } = useAdmin()
        if (isAdmin.value === null) await fetchAdminRole()
        if (isAdmin.value !== true) {
            return showError(createError({ statusCode: 403, statusMessage: 'Forbidden - You don\'t have permission to access this page' }))
        }
        return
    }

    let fetchOptions = {}
    const event = useRequestEvent()
    const cookie = event?.node?.req?.headers?.cookie
    if (cookie) fetchOptions.headers = { cookie }

    try {
        await $fetch('/api/admin/check', fetchOptions)
    } catch {
        return showError(createError({ statusCode: 403, statusMessage: 'Forbidden - You don\'t have permission to access this page' }))
    }
})
