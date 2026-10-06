/**
 * Offline IndexedDB: one anime snapshot + one MP4 episode record per key.
 */
import {
    OFFLINE_CONCURRENCY,
    OFFLINE_DB,
    OFFLINE_DB_VERSION,
    OFFLINE_EP_STORE,
    OFFLINE_META_STORE,
    downloadVideoApi,
    offlineEpisodeKey,
    offlineMetaKey,
    throwIfAborted,
} from '~~/shared/offline'
import {
    collectThumbnailUrls,
    fetchEpisodeMp4,
    fetchEpisodeThumbnailBlob,
    fetchEpisodeThumbnailVtt,
    mapPool,
} from '~/utils/offlineMedia'
import {
    addEpisodeToLibrary,
    mergeAnimeSnapshot,
    needsAnimeMetaRewrite,
    needsEpisodeRewrite,
    playbackFromVideo,
    readAnimeMeta,
    readEpisode,
    thumbnailAssetsFromEpisode,
    toLibraryItem,
    episodeRecord,
} from '~/utils/offlineSchema'

let dbPromise = null

function openDb() {
    if (dbPromise) return dbPromise
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(OFFLINE_DB, OFFLINE_DB_VERSION)
        req.onerror = () => reject(req.error)
        req.onsuccess = () => resolve(req.result)
        req.onupgradeneeded = (e) => {
            const db = e.target.result
            for (const name of [OFFLINE_EP_STORE, OFFLINE_META_STORE]) {
                if (!db.objectStoreNames.contains(name)) db.createObjectStore(name)
            }
        }
    })
    return dbPromise
}

function asPromise(req) {
    return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
    })
}

function complete(tx) {
    return new Promise((resolve, reject) => {
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
    })
}

async function openStore(storeName, mode) {
    const db = await openDb()
    const tx = db.transaction(storeName, mode)
    return { tx, store: tx.objectStore(storeName) }
}

async function idbGet(storeName, key) {
    const { store } = await openStore(storeName, 'readonly')
    return asPromise(store.get(key))
}

async function idbPut(storeName, key, value) {
    const { tx, store } = await openStore(storeName, 'readwrite')
    store.put(value, key)
    return complete(tx)
}

async function idbDelete(storeName, key) {
    const { tx, store } = await openStore(storeName, 'readwrite')
    store.delete(key)
    return complete(tx)
}

async function idbKeys(storeName) {
    const { store } = await openStore(storeName, 'readonly')
    return (await asPromise(store.getAllKeys())) || []
}

async function idbPairs(storeName) {
    const { tx, store } = await openStore(storeName, 'readonly')
    const keysReq = store.getAllKeys()
    const valsReq = store.getAll()
    await complete(tx)
    const keys = keysReq.result || []
    const values = valsReq.result || []
    return keys.map((key, i) => ({ key, value: values[i] }))
}

async function migratePairs(storeName, read, needsRewrite) {
    const kept = []
    for (const { key, value } of await idbPairs(storeName)) {
        const rec = read(value)
        if (!rec) {
            await idbDelete(storeName, key)
            continue
        }
        if (needsRewrite(value)) await idbPut(storeName, key, rec)
        kept.push({ key, rec })
    }
    return kept
}

export function useOfflineAnimeDownloads() {
    const getEpisode = (refId, episodeKey) =>
        idbGet(OFFLINE_EP_STORE, offlineEpisodeKey(refId, episodeKey)).then(readEpisode)

    async function saveAnimeSnapshot(anime, { signal } = {}) {
        if (!anime?.refId) return
        const key = offlineMetaKey(anime.refId)
        const existing = readAnimeMeta(await idbGet(OFFLINE_META_STORE, key))
        let imageBlob = existing?.imageBlob || null
        const next = mergeAnimeSnapshot(anime, existing, imageBlob)
        if (!imageBlob && /^https?:\/\//i.test(next.image)) {
            imageBlob = await fetchEpisodeThumbnailBlob(next.image, signal)
        }
        await idbPut(OFFLINE_META_STORE, key, imageBlob === next.imageBlob ? next : mergeAnimeSnapshot(anime, existing, imageBlob))
    }

    const loadAnimeSnapshot = (refId) => idbGet(OFFLINE_META_STORE, offlineMetaKey(refId)).then(readAnimeMeta)
    const deleteAnimeSnapshot = (refId) => idbDelete(OFFLINE_META_STORE, offlineMetaKey(refId))
    const hasEpisode = async (refId, episodeKey) => !!(await getEpisode(refId, episodeKey))

    async function listDownloadedEpisodeKeys(refId) {
        const pairs = await idbPairs(OFFLINE_EP_STORE)
        return pairs
            .map(({ value }) => readEpisode(value))
            .filter((ep) => ep && ep.refId === String(refId))
            .map((ep) => ep.episodeKey)
    }

    async function removeEpisode(refId, episodeKey) {
        await idbDelete(OFFLINE_EP_STORE, offlineEpisodeKey(refId, episodeKey))
        if (!(await listDownloadedEpisodeKeys(refId)).length) await deleteAnimeSnapshot(refId)
    }

    async function clearAnimeDownloads(refId) {
        const prefix = offlineEpisodeKey(refId, '')
        for (const key of await idbKeys(OFFLINE_EP_STORE)) {
            if (String(key).startsWith(prefix)) await idbDelete(OFFLINE_EP_STORE, key)
        }
        await deleteAnimeSnapshot(refId)
    }

    async function listDownloadedAnime() {
        const library = new Map()
        for (const { rec } of await migratePairs(OFFLINE_EP_STORE, readEpisode, needsEpisodeRewrite)) {
            addEpisodeToLibrary(library, rec)
        }
        const snapshots = []
        for (const { rec } of await migratePairs(OFFLINE_META_STORE, readAnimeMeta, needsAnimeMetaRewrite)) {
            if (!library.has(rec.refId)) await deleteAnimeSnapshot(rec.refId)
            else snapshots.push(rec)
        }
        const snapMap = new Map(snapshots.map((s) => [s.refId, s]))
        return [...library.values()]
            .map((row) => toLibraryItem(row, snapMap.get(row.refId)))
            .sort((a, b) => b.latestSavedAt - a.latestSavedAt)
    }

    async function getOfflinePlayback(refId, episodeKey) {
        const episode = await getEpisode(refId, episodeKey)
        return episode ? playbackFromVideo(episode.video) : null
    }

    async function getOfflineThumbnailAssets(refId, episodeKey) {
        const episode = await getEpisode(refId, episodeKey)
        return episode ? thumbnailAssetsFromEpisode(episode) : null
    }

    async function downloadEpisode({
        refId,
        animeTitle,
        animeSnapshot,
        episodeKey,
        token,
        videoId,
        thumbnailsJpgUrl,
        thumbnailsVttUrl,
        onProgress,
        signal,
        waitWhilePaused,
        qualityHeight,
    }) {
        const source = await $fetch(downloadVideoApi(token), { signal })
        if (source?.error) throw new Error(source.error)
        await waitWhilePaused?.()
        throwIfAborted(signal)

        const jpgUrl = source.thumbnails_jpg_url || thumbnailsJpgUrl || null
        let thumbnailVtt = source.thumbnail_vtt_text || null
        if (!thumbnailVtt && (source.thumbnails_vtt_url || thumbnailsVttUrl)) {
            thumbnailVtt = await fetchEpisodeThumbnailVtt(source.thumbnails_vtt_url || thumbnailsVttUrl, signal)
        }
        const thumbnailSheets = {}
        await mapPool(collectThumbnailUrls(thumbnailVtt, jpgUrl), OFFLINE_CONCURRENCY, async (url) => {
            const sheet = await fetchEpisodeThumbnailBlob(url, signal)
            if (sheet) thumbnailSheets[url] = sheet
        })

        await idbPut(
            OFFLINE_EP_STORE,
            offlineEpisodeKey(refId, episodeKey),
            episodeRecord({
                refId,
                episodeKey,
                animeTitle,
                videoId,
                video: await fetchEpisodeMp4(source, onProgress, { signal, waitWhilePaused }, qualityHeight),
                thumbnailVtt,
                thumbnailSheets,
                thumbnailsJpgUrl: jpgUrl,
            }),
        )
        if (animeSnapshot) await saveAnimeSnapshot(animeSnapshot, { signal })
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
