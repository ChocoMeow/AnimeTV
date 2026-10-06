/** Shared offline-download constants and keys. */

export const OFFLINE_DB = 'OfflineAnime'
export const OFFLINE_DB_VERSION = 1
export const OFFLINE_EP_STORE = 'episodes'
export const OFFLINE_META_STORE = 'animeMeta'

export const OFFLINE_CONCURRENCY = 3
export const BUNNY_MP4_HEIGHTS = Object.freeze([1080, 720, 480, 360, 240])
export const VIDEO_MP4 = 'video/mp4'
export const UNTITLED_ANIME = '未命名作品'

export const SEGMENT_RETRIES = 2
export const SEGMENT_503_RETRIES = 4
export const SEGMENT_RETRY_MS = 400
export const RETRY_STATUSES = new Set([408, 429, 502, 503])

export function offlineEpisodeKey(refId, episodeKey) {
    return `${refId}::${String(episodeKey)}`
}

export function offlineMetaKey(refId) {
    return `anime::${refId}`
}

export function heightLabel(height) {
    return `${height}p`
}

export function bunnyQualityOptions() {
    return BUNNY_MP4_HEIGHTS.map((height) => ({ value: height, label: heightLabel(height) }))
}

export function abortError() {
    return new DOMException('Aborted', 'AbortError')
}

export function isAbortError(err) {
    return err?.name === 'AbortError' || err?.name === 'CanceledError'
}

export function throwIfAborted(signal) {
    if (signal?.aborted) throw abortError()
}

export function httpStatusFromError(err) {
    return Number(/：(\d{3})$/.exec(err?.message || '')?.[1] || 0)
}

export function downloadVideoApi(token) {
    return `/api/download-video/${token}`
}

export function mediaProxyApi(path, upstream, cookie = '') {
    return `/api/${path}?url=${encodeURIComponent(upstream)}&cookie=${encodeURIComponent(cookie || '')}`
}

export function downloadProxyUrl(upstream, cookie = '') {
    return mediaProxyApi('download-proxy', upstream, cookie)
}

export function proxyVideoUrl(upstream, cookie = '') {
    return mediaProxyApi('proxy-video', upstream, cookie)
}
