/**
 * Offline IndexedDB: one anime snapshot + one MP4 episode record per key.
 */
import {
    OFFLINE_EP_STORE,
    OFFLINE_META_STORE,
    OFFLINE_SEGMENT_CONCURRENCY,
    UNTITLED_ANIME,
    downloadVideoApi,
    offlineEpisodeKey,
    offlineMetaKey,
    throwIfAborted,
} from '#shared/utils/offline'
import { idbDelete, idbGet, idbKeys, idbPairs, idbPut } from '~/utils/offlineDb'
import {
    collectThumbnailUrls,
    fetchEpisodeMp4,
    fetchEpisodeThumbnailBlob,
    fetchEpisodeThumbnailVtt,
    mapPool,
} from '~/utils/offlineMedia'
import {
    addEpisodeToLibrary,
    episodeRecord,
    mergeAnimeSnapshot,
    needsAnimeMetaRewrite,
    needsEpisodeRewrite,
    playbackFromVideo,
    readAnimeMeta,
    readEpisode,
    thumbnailAssetsFromEpisode,
    toLibraryItem,
} from '~/utils/offlineSchema'
import { clearJob, getJob, listJobs, putJob } from '~/utils/offlineStaging'

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
        const imageBlob = existing?.imageBlob?.size ? existing.imageBlob : null
        const next = mergeAnimeSnapshot(anime, existing, imageBlob)
        // Details first — survives kill during cover fetch.
        await idbPut(OFFLINE_META_STORE, key, next)
        if (imageBlob || !/^https?:\/\//i.test(next.image)) return
        const cover = await fetchEpisodeThumbnailBlob(next.image, signal)
        if (cover?.size) await idbPut(OFFLINE_META_STORE, key, mergeAnimeSnapshot(anime, next, cover))
    }

    const loadAnimeSnapshot = (refId) => idbGet(OFFLINE_META_STORE, offlineMetaKey(refId)).then(readAnimeMeta)
    const deleteAnimeSnapshot = (refId) => idbDelete(OFFLINE_META_STORE, offlineMetaKey(refId))
    const hasEpisode = async (refId, episodeKey) => !!(await getEpisode(refId, episodeKey))

    async function listDownloadedEpisodeKeys(refId) {
        return (await idbPairs(OFFLINE_EP_STORE))
            .map(({ value }) => readEpisode(value))
            .filter((ep) => ep && ep.refId === String(refId))
            .map((ep) => ep.episodeKey)
    }

    async function removeEpisode(refId, episodeKey) {
        const id = offlineEpisodeKey(refId, episodeKey)
        await idbDelete(OFFLINE_EP_STORE, id)
        await clearJob(id)
        if (!(await listDownloadedEpisodeKeys(refId)).length) await deleteAnimeSnapshot(refId)
    }

    async function clearAnimeDownloads(refId) {
        const prefix = offlineEpisodeKey(refId, '')
        for (const key of await idbKeys(OFFLINE_EP_STORE)) {
            if (String(key).startsWith(prefix)) await idbDelete(OFFLINE_EP_STORE, key)
        }
        for (const job of await listJobs()) {
            if (String(job.refId) === String(refId)) await clearJob(job.id)
        }
        await deleteAnimeSnapshot(refId)
    }

    async function listDownloadedAnime() {
        const library = new Map()
        for (const { rec } of await migratePairs(OFFLINE_EP_STORE, readEpisode, needsEpisodeRewrite)) {
            addEpisodeToLibrary(library, rec)
        }
        const pending = new Set((await listJobs()).map((j) => String(j.refId)))
        const snapMap = new Map()
        for (const { rec } of await migratePairs(OFFLINE_META_STORE, readAnimeMeta, needsAnimeMetaRewrite)) {
            if (library.has(rec.refId) || pending.has(String(rec.refId))) snapMap.set(rec.refId, rec)
            else await deleteAnimeSnapshot(rec.refId)
        }
        for (const row of library.values()) {
            if (snapMap.has(row.refId)) continue
            await saveAnimeSnapshot({ refId: row.refId, title: row.animeTitle })
            const saved = await loadAnimeSnapshot(row.refId)
            if (saved) snapMap.set(row.refId, saved)
        }
        return [...library.values()]
            .map((row) => toLibraryItem(row, snapMap.get(row.refId)))
            .sort((a, b) => b.latestSavedAt - a.latestSavedAt)
    }

    async function downloadEpisode({
        refId,
        animeTitle,
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
        const jobId = offlineEpisodeKey(refId, episodeKey)
        let job = await getJob(jobId)
        if (job && qualityHeight != null && job.qualityHeight != null && Number(job.qualityHeight) !== Number(qualityHeight)) {
            await clearJob(jobId)
            job = null
        }

        const source = await $fetch(downloadVideoApi(token), { signal })
        if (source?.error) throw new Error(source.error)
        await waitWhilePaused?.()
        throwIfAborted(signal)

        job = {
            id: jobId,
            refId: String(refId),
            episodeKey: String(episodeKey),
            token,
            kind: source.kind || 'mp4',
            qualityHeight: qualityHeight ?? job?.qualityHeight ?? null,
            animeTitle: animeTitle || job?.animeTitle || UNTITLED_ANIME,
            done: job?.done || 0,
            total: job?.total || 0,
            status: 'downloading',
        }
        await putJob(job)
        const onJob = async (patch) => putJob((job = { ...job, ...patch, status: 'downloading' }))

        const jpgUrl = source.thumbnails_jpg_url || thumbnailsJpgUrl || null
        const [video, thumbs] = await Promise.all([
            fetchEpisodeMp4(source, onProgress, { signal, waitWhilePaused, jobId, onJob }, qualityHeight),
            (async () => {
                let thumbnailVtt = source.thumbnail_vtt_text || null
                if (!thumbnailVtt && (source.thumbnails_vtt_url || thumbnailsVttUrl)) {
                    thumbnailVtt = await fetchEpisodeThumbnailVtt(source.thumbnails_vtt_url || thumbnailsVttUrl, signal)
                }
                const thumbnailSheets = {}
                await mapPool(collectThumbnailUrls(thumbnailVtt, jpgUrl), OFFLINE_SEGMENT_CONCURRENCY, async (url) => {
                    const sheet = await fetchEpisodeThumbnailBlob(url, signal)
                    if (sheet) thumbnailSheets[url] = sheet
                })
                return { thumbnailVtt, thumbnailSheets }
            })(),
        ])
        throwIfAborted(signal)

        await idbPut(
            OFFLINE_EP_STORE,
            jobId,
            episodeRecord({
                refId,
                episodeKey,
                animeTitle: job.animeTitle,
                videoId,
                video,
                thumbnailVtt: thumbs.thumbnailVtt,
                thumbnailSheets: thumbs.thumbnailSheets,
                thumbnailsJpgUrl: jpgUrl,
            }),
        )
        if (!(await loadAnimeSnapshot(refId))) {
            await saveAnimeSnapshot({ refId, title: job.animeTitle }, { signal })
        }
        await clearJob(jobId)
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
        getOfflinePlayback: async (refId, episodeKey) => {
            const ep = await getEpisode(refId, episodeKey)
            return ep ? playbackFromVideo(ep.video) : null
        },
        getOfflineThumbnailAssets: async (refId, episodeKey) => {
            const ep = await getEpisode(refId, episodeKey)
            return ep ? thumbnailAssetsFromEpisode(ep) : null
        },
        downloadEpisode,
    }
}
