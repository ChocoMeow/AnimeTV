/**
 * Client-safe helpers. Registered source ids are server-discovered from
 * `server/lib/videoProviders/sources/*.js` (admin loads them via API).
 */

/**
 * Optional browser CORS CDN allowlist. Prefer `directHlsHosts` on the server
 * provider; fill this only if the client must fetch the CDN directly.
 */
export const DIRECT_HLS_HOSTS = Object.freeze([])

export function isDirectHlsHost(hostname) {
    if (!hostname || !DIRECT_HLS_HOSTS.length) return false
    const host = String(hostname).toLowerCase()
    return DIRECT_HLS_HOSTS.some((h) => {
        const base = String(h).toLowerCase()
        return host === base || host.endsWith(`.${base}`)
    })
}
