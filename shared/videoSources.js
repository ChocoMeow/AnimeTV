/** Client + server shared video-source ids (open for new entries). */
export const VIDEO_SOURCE = Object.freeze({
    ANIME1: 'anime1',
    TWXGCT: 'twxgct',
})

export const VIDEO_SOURCES = Object.freeze(Object.values(VIDEO_SOURCE))

export const DEFAULT_VIDEO_SOURCE = VIDEO_SOURCE.ANIME1

/** HLS CDNs with CORS * — browser may fetch segments directly (skip proxy hop). */
export const DIRECT_HLS_HOST = /(?:^|\.)bzcdn\.net$/i

export function isValidVideoSource(value) {
    return VIDEO_SOURCES.includes(value)
}

export function normalizeVideoSource(value) {
    if (!value || typeof value !== 'string') return DEFAULT_VIDEO_SOURCE
    return isValidVideoSource(value) ? value : null
}
