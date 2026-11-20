/**
 * Episode playback contracts.
 * GET /api/episode/:token → playback body | `{ error }`
 * GET /api/media/download/:token → download body
 */

import { createError } from 'h3'

const str = (v) => (typeof v === 'string' ? v.trim() : '')

/** @param {unknown} token */
export function parseEpisodeTokenParam(token) {
    const value = str(token)
    if (!value) {
        throw createError({ statusCode: 400, statusMessage: 'Missing episode token', message: '缺少集數憑證。' })
    }
    return value
}
