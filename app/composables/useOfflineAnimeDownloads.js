/**
 * Offline downloads: IndexedDB stores anime metadata snapshots and episode video blobs.
 * Progressive MP4: fetched via Range requests. HLS: segments stored and replayed via blob m3u8 + hls.js.
 */

const DB_NAME = 'AnimeTVOffline'
const DB_VERSION = 1
const EP_STORE = 'episodes'
const META_STORE = 'animeMeta'

const HLS_CONCURRENCY = 8

let dbPromise = null

function toCloneable(value, fallback) {
    try {
        return structuredClone(value)
    } catch {
        try {
            return JSON.parse(JSON.stringify(value))
        } catch {
            return fallback
        }
    }
}

function openDb() {
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result)
        req.onupgradeneeded = (e) => {
            const db = e.target.result
            if (!db.objectStoreNames.contains(EP_STORE)) db.createObjectStore(EP_STORE)
            if (!db.objectStoreNames.contains(META_STORE)) db.createObjectStore(META_STORE)
        }
    })
    return dbPromise
}

function epKey(refId, episodeKey) {
    return `${refId}::${String(episodeKey)}`
}

async function idbGet(storeName, key) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readonly')
        const req = tx.objectStore(storeName).get(key)
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

async function idbPut(storeName, key, value) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.objectStore(storeName).put(value, key)
    })
}

async function idbDelete(storeName, key) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, 'readwrite')
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
        tx.objectStore(storeName).delete(key)
    })
}

async function idbKeys(storeName) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAllKeys()
        req.onsuccess = () => resolve(req.result || [])
        req.onerror = () => reject(req.error)
    })
}

async function idbEntries(storeName) {
    const db = await openDb()
    return new Promise((resolve, reject) => {
        const req = db.transaction(storeName, 'readonly').objectStore(storeName).getAll()
        req.onsuccess = () => resolve(req.result || [])
        req.onerror = () => reject(req.error)
    })
}

async function mapPool(items, concurrency, task) {
    const results = new Array(items.length)
    let nextIndex = 0
    let finished = 0
    return await new Promise((resolve, reject) => {
        const runNext = () => {
            if (finished === items.length) {
                resolve(results)
                return
            }
            while (nextIndex < items.length && concurrency > 0) {
                const idx = nextIndex++
                concurrency--
                Promise.resolve(task(items[idx], idx))
                    .then((res) => {
                        results[idx] = res
                        finished++
                        concurrency++
                        runNext()
                    })
                    .catch(reject)
            }
        }
        if (items.length === 0) resolve(results)
        else runNext()
    })
}

/** @param {string} playlistText */
function isMasterPlaylist(playlistText) {
    return /#EXT-X-STREAM-INF/i.test(playlistText)
}

/**
 * @param {string} text
 * @param {string} baseUrl - URL of this playlist (for resolving relatives)
 */
function pickFirstVariantUrl(text, baseUrl) {
    const lines = text.split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim()
        if (line.startsWith('#EXT-X-STREAM-INF')) {
            for (let j = i + 1; j < lines.length; j++) {
                const u = lines[j].trim()
                if (u && !u.startsWith('#')) {
                    try {
                        return new URL(u, baseUrl).href
                    } catch {
                        return u
                    }
                }
            }
        }
    }
    return null
}

/**
 * @returns {{ duration: number, uri: string }[]}
 */
function parseMediaSegments(text, baseUrl) {
    const lines = text.split(/\r?\n/)
    const out = []
    let pendingDuration = null
    for (const raw of lines) {
        const line = raw.trim()
        if (line.startsWith('#EXTINF:')) {
            const m = /^#EXTINF:([\d.]+)/.exec(line)
            pendingDuration = m ? parseFloat(m[1]) : 10
        } else if (line && !line.startsWith('#')) {
            let uri
            try {
                uri = new URL(line, baseUrl).href
            } catch {
                uri = line
            }
            out.push({
                duration: pendingDuration ?? 10,
                uri,
            })
            pendingDuration = null
        }
    }
    return out
}

async function resolveMediaPlaylistUrl(proxyPlaylistUrl, signal) {
    let url = proxyPlaylistUrl
    let text = await (await fetch(url, { signal })).text()
    let guard = 0
    while (isMasterPlaylist(text) && guard < 5) {
        const next = pickFirstVariantUrl(text, url)
        if (!next) break
        url = next
        text = await (await fetch(url, { signal })).text()
        guard++
    }
    return { mediaPlaylistUrl: url, text }
}

async function fetchBlobWithProgress(url, onProgress, { signal, waitWhilePaused } = {}) {
    await waitWhilePaused?.()
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const res = await fetch(url, { signal })
    if (!res.ok) throw new Error(`下載失敗：${res.status}`)
    const total = parseInt(res.headers.get('content-length') || '0', 10)
    if (!res.body || !total) {
        const buf = await res.arrayBuffer()
        onProgress?.({ phase: 'progressive', current: 1, total: 1 })
        return new Blob([buf], { type: 'video/mp4' })
    }

    const reader = res.body.getReader()
    const chunks = []
    let loaded = 0
    // Report in 100 steps for smooth UI.
    while (true) {
        await waitWhilePaused?.()
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        const { done, value } = await reader.read()
        if (done) break
        chunks.push(value)
        loaded += value.byteLength
        const step = Math.max(1, Math.floor((loaded / total) * 100))
        onProgress?.({ phase: 'progressive', current: step, total: 100 })
    }
    return new Blob(chunks, { type: 'video/mp4' })
}

async function fetchEpisodeThumbnailBlob(videoId, signal) {
    if (!videoId) return null
    try {
        const res = await fetch(`https://pt2.anime1.me/${videoId}/thumbnails.jpg`, { signal })
        if (!res.ok) return null
        return await res.blob()
    } catch {
        return null
    }
}

async function fetchEpisodeThumbnailVtt(videoId, signal) {
    if (!videoId) return null
    try {
        const res = await fetch(`https://pt2.anime1.me/${videoId}/thumbnails.vtt`, { signal })
        if (!res.ok) return null
        return await res.text()
    } catch {
        return null
    }
}

/**
 * @param {string} proxyPlaylistUrl - same URL the player uses for HLS
 * @param {(p: { phase: string, current: number, total: number }) => void} onProgress
 */
async function fetchHlsOfflineData(proxyPlaylistUrl, onProgress, { signal, waitWhilePaused } = {}) {
    await waitWhilePaused?.()
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
    const { mediaPlaylistUrl, text } = await resolveMediaPlaylistUrl(proxyPlaylistUrl, signal)
    const segments = parseMediaSegments(text, mediaPlaylistUrl)
    if (segments.length === 0) throw new Error('無法解析播放清單')
    let done = 0
    const blobs = await mapPool(segments, HLS_CONCURRENCY, async (seg) => {
        await waitWhilePaused?.()
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        const res = await fetch(seg.uri, { signal })
        if (!res.ok) throw new Error(`片段下載失敗：${res.status}`)
        const b = await res.blob()
        done++
        onProgress?.({ phase: 'segment', current: done, total: segments.length })
        return b
    })
    const durations = segments.map((s) => s.duration)
    const target = Math.max(1, Math.ceil(Math.max(...durations)))
    return { segmentBlobs: blobs, extinfSeconds: durations, targetDuration: target }
}

function buildOfflineHlsBlobUrl(record) {
    const { segmentBlobs, extinfSeconds, targetDuration } = record
    const urls = segmentBlobs.map((b) => URL.createObjectURL(b))
    const lines = ['#EXTM3U', '#EXT-X-VERSION:3', `#EXT-X-TARGETDURATION:${targetDuration}`]
    for (let i = 0; i < urls.length; i++) {
        const dur = extinfSeconds[i] ?? 10
        lines.push(`#EXTINF:${dur},`)
        lines.push(urls[i])
    }
    lines.push('#EXT-X-ENDLIST')
    const playlistBlob = new Blob([lines.join('\n')], {
        type: 'application/vnd.apple.mpegurl',
    })
    const masterUrl = URL.createObjectURL(playlistBlob)
    return {
        url: masterUrl,
        isHls: true,
        revoke: () => {
            urls.forEach((u) => URL.revokeObjectURL(u))
            URL.revokeObjectURL(masterUrl)
        },
    }
}

function buildOfflineMp4Url(blob) {
    const url = URL.createObjectURL(blob)
    return {
        url,
        isHls: false,
        revoke: () => URL.revokeObjectURL(url),
    }
}

export function useOfflineAnimeDownloads() {
    const metaKey = (refId) => `anime::${refId}`

    async function saveAnimeSnapshot(anime) {
        if (!anime?.refId) return
        const snapshot = {
            refId: String(anime.refId),
            title: anime.title || '',
            image: anime.image || '',
            description: anime.description || '',
            episodes: toCloneable(anime.episodes, {}),
            tags: toCloneable(anime.tags, []),
            views: anime.views ?? 0,
            userRating: toCloneable(anime.userRating, null),
            relatedAnime: toCloneable(anime.relatedAnime, []),
            detailId: anime.detailId ?? null,
            isFavorite: !!anime.isFavorite,
            isOfflineSnapshot: true,
        }
        await idbPut(META_STORE, metaKey(anime.refId), snapshot)
    }

    async function loadAnimeSnapshot(refId) {
        return await idbGet(META_STORE, metaKey(refId))
    }

    async function deleteAnimeSnapshot(refId) {
        await idbDelete(META_STORE, metaKey(refId))
    }

    async function hasEpisode(refId, episodeKey) {
        const rec = await idbGet(EP_STORE, epKey(refId, episodeKey))
        return !!rec
    }

    async function listDownloadedEpisodeKeys(refId) {
        const keys = await idbKeys(EP_STORE)
        const prefix = `${refId}::`
        return keys.filter((k) => String(k).startsWith(prefix)).map((k) => String(k).slice(prefix.length))
    }

    async function removeEpisode(refId, episodeKey) {
        await idbDelete(EP_STORE, epKey(refId, episodeKey))
        const remaining = await listDownloadedEpisodeKeys(refId)
        if (remaining.length === 0) await deleteAnimeSnapshot(refId)
    }

    async function clearAnimeDownloads(refId) {
        const keys = await listDownloadedEpisodeKeys(refId)
        for (const key of keys) {
            await idbDelete(EP_STORE, epKey(refId, key))
        }
        await deleteAnimeSnapshot(refId)
    }

    async function listDownloadedAnime() {
        const entries = await idbEntries(EP_STORE)
        const animeMap = new Map()
        for (const rec of entries) {
            const refId = rec.refId
            if (!refId) continue
            if (!animeMap.has(refId)) {
                animeMap.set(refId, {
                    refId,
                    animeTitle: rec.animeTitle || '未命名作品',
                    episodeCount: 0,
                    totalBytes: 0,
                    latestSavedAt: rec.savedAt || 0,
                    episodes: [],
                })
            }
            const item = animeMap.get(refId)
            item.episodeCount += 1
            item.latestSavedAt = Math.max(item.latestSavedAt, rec.savedAt || 0)
            item.episodes.push(String(rec.episodeKey))
            if (rec.kind === 'mp4' && rec.blob) item.totalBytes += rec.blob.size || 0
            if (rec.kind === 'hls' && Array.isArray(rec.segmentBlobs)) {
                item.totalBytes += rec.segmentBlobs.reduce((sum, b) => sum + (b?.size || 0), 0)
            }
            if (rec.thumbnailBlob) item.totalBytes += rec.thumbnailBlob.size || 0
            if (rec.thumbnailVtt) item.totalBytes += new TextEncoder().encode(rec.thumbnailVtt).length
        }

        const snapshots = await idbEntries(META_STORE)
        const snapshotMap = new Map(snapshots.map((s) => [s.refId, s]))

        return Array.from(animeMap.values())
            .map((item) => {
                const snap = snapshotMap.get(item.refId)
                return {
                    ...item,
                    episodes: item.episodes.sort((a, b) => {
                        const na = parseInt(a, 10)
                        const nb = parseInt(b, 10)
                        if (!isNaN(na) && !isNaN(nb)) return na - nb
                        return a.localeCompare(b)
                    }),
                    image: snap?.image || null,
                }
            })
            .sort((a, b) => b.latestSavedAt - a.latestSavedAt)
    }

    /**
     * @returns {Promise<{ url: string, isHls: boolean, revoke: () => void } | null>}
     */
    async function getOfflinePlayback(refId, episodeKey) {
        const rec = await idbGet(EP_STORE, epKey(refId, episodeKey))
        if (!rec) return null
        if (rec.kind === 'mp4') return buildOfflineMp4Url(rec.blob)
        if (rec.kind === 'hls') return buildOfflineHlsBlobUrl(rec)
        return null
    }

    /**
     * Returns locally downloaded thumbnail assets for an episode when available.
     * @returns {Promise<{ jpgUrl: string | null, vttText: string | null, revoke: () => void } | null>}
     */
    async function getOfflineThumbnailAssets(refId, episodeKey) {
        const rec = await idbGet(EP_STORE, epKey(refId, episodeKey))
        if (!rec) return null
        let jpgUrl = null
        if (rec.thumbnailBlob) {
            jpgUrl = URL.createObjectURL(rec.thumbnailBlob)
        }
        const vttText = typeof rec.thumbnailVtt === 'string' ? rec.thumbnailVtt : null
        if (!jpgUrl && !vttText) return null
        return {
            jpgUrl,
            vttText,
            revoke: () => {
                if (jpgUrl) URL.revokeObjectURL(jpgUrl)
            },
        }
    }

    /**
     * Build proxy URL and download episode (same logic as anime page).
     */
    async function downloadEpisode({ refId, animeTitle, animeSnapshot, episodeKey, token, videoId, onProgress, signal, waitWhilePaused }) {
        const source = await $fetch(`/api/download-video/${token}`, { signal })
        if (source?.error) throw new Error(source.error)
        await waitWhilePaused?.()
        if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
        const [thumbnailBlob, thumbnailVtt] = await Promise.all([
            fetchEpisodeThumbnailBlob(videoId, signal),
            fetchEpisodeThumbnailVtt(videoId, signal),
        ])

        if (source.kind === 'hls') {
            onProgress?.({ phase: 'playlist', current: 0, total: 1 })
            const hlsData = await fetchHlsOfflineData(source.playlistUrl, (p) => onProgress?.({ phase: 'segment', ...p }), {
                signal,
                waitWhilePaused,
            })
            await idbPut(EP_STORE, epKey(refId, episodeKey), {
                kind: 'hls',
                refId,
                episodeKey: String(episodeKey),
                animeTitle,
                videoId: videoId || null,
                thumbnailBlob,
                thumbnailVtt,
                ...hlsData,
                savedAt: Date.now(),
            })
        } else if (source.kind === 'mp4' && source.downloadUrl) {
            // Use dedicated full-file API (faster than many chunked range requests).
            const blob = await fetchBlobWithProgress(source.downloadUrl, onProgress, { signal, waitWhilePaused })
            await idbPut(EP_STORE, epKey(refId, episodeKey), {
                kind: 'mp4',
                refId,
                episodeKey: String(episodeKey),
                animeTitle,
                videoId: videoId || null,
                thumbnailBlob,
                thumbnailVtt,
                blob,
                savedAt: Date.now(),
            })
        } else {
            throw new Error('影片下載來源無效')
        }

        if (animeSnapshot) await saveAnimeSnapshot(animeSnapshot)
    }

    return {
        saveAnimeSnapshot,
        loadAnimeSnapshot,
        deleteAnimeSnapshot,
        hasEpisode,
        listDownloadedEpisodeKeys,
        removeEpisode,
        clearAnimeDownloads,
        listDownloadedAnime,
        getOfflinePlayback,
        getOfflineThumbnailAssets,
        downloadEpisode,
    }
}
