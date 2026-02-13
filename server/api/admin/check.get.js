/** Returns { ok: true } if the current user has admin role; 403 otherwise. Used by header to show admin nav. */
export default defineEventHandler(async (event) => {
    await authAdmin(event)
    return { ok: true }
})
