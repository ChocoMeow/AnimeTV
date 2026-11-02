/** Shared offline-download constants and keys. */

export const OFFLINE_DB = 'OfflineAnime'
export const OFFLINE_DB_VERSION = 3
export const OFFLINE_EP_STORE = 'episodes'
export const OFFLINE_META_STORE = 'animeMeta'
export const OFFLINE_HISTORY_STORE = 'watchHistory'
export const OFFLINE_PARTS_STORE = 'downloadParts'

/** Episodes downloading at once (keep low — each opens many segment requests). */
export const OFFLINE_CONCURRENCY = 3
/** HLS segments / thumbnail sheets in parallel per episode. */
export const OFFLINE_SEGMENT_CONCURRENCY = 8
/** Coalesce progressive MP4 stream chunks before each IDB put. */
export const STAGE_CHUNK_BYTES = 1_048_576
export const BUNNY_MP4_HEIGHTS = Object.freeze([1080, 720, 480, 360, 240])
export const VIDEO_MP4 = 'video/mp4'
export const UNTITLED_ANIME = '未命名作品'

export const SEGMENT_RETRIES = 2
export const SEGMENT_503_RETRIES = 4
export const SEGMENT_RETRY_MS = 400
export const RETRY_STATUSES = new Set([408, 429, 502, 503])
export const SEGMENT_FETCH_TIMEOUT_MS = 45_000
export const PROGRESSIVE_IDLE_TIMEOUT_MS = 60_000

export function offlineEpisodeKey(refId, episodeKey) {
    return `${refId}::${String(episodeKey)}`
}

export function offlinePartMetaKey(jobId) {
    return `${jobId}::meta`
}

export function offlinePartKey(jobId, index) {
    return `${jobId}::${index}`
}

export function offlineMetaKey(refId) {
    return `anime::${refId}`
}

/** iPhone Safari jetsams under multi-episode remux pressure. */
export function offlineDownloadConcurrency() {
    if (typeof navigator === 'undefined') return OFFLINE_CONCURRENCY
    return /iPhone|iPad|iPod/i.test(navigator.userAgent) ? 1 : OFFLINE_CONCURRENCY
}

export function offlineHistoryKey(userId, refId, episodeKey) {
    return `${userId}::${refId}::${String(episodeKey)}`
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
