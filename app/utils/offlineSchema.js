/**
 * Unified OfflineAnime records. anime1 and twxgct share one MP4 episode shape.
 * HLS is a download transport only and is never stored.
 *
 * @typedef {{ refId: string, title: string, image: string, imageBlob: Blob|null, description: string, episodes: Record<string, object>, tags: any[], views: number, userRating: any, relatedAnime: any[], detailId: string|null, isFavorite: boolean }} OfflineAnimeMeta
 * @typedef {{ refId: string, episodeKey: string, animeTitle: string, videoId: string|null, video: Blob, thumbnailVtt: string|null, thumbnailSheets: Record<string, Blob>, thumbnailsJpgUrl: string|null, savedAt: number }} OfflineEpisode
 * @typedef {{ url: string, revoke: () => void }} OfflinePlayback
 * @typedef {{ jpgUrl: string|null, vttText: string|null, revoke: () => void }} OfflineThumbnails
 */

import { UNTITLED_ANIME } from '#shared/utils/offline'

const isBlob = (value) => typeof Blob !== 'undefined' && value instanceof Blob
const isDict = (value) => !!value && typeof value === 'object' && !Array.isArray(value)

/** Strip ephemeral blob:/data: URLs — only remote http(s) covers are persistable. */
export function remoteUrl(value) {
    const url = String(value || '')
    return !url || url.startsWith('blob:') || url.startsWith('data:') ? '' : url
}

export function toCloneable(value, fallback) {
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

export function animeMetaRecord(fields) {
    return {
        refId: String(fields.refId),
        title: String(fields.title || ''),
        image: remoteUrl(fields.image),
        imageBlob: isBlob(fields.imageBlob) ? fields.imageBlob : null,
        description: String(fields.description || ''),
        episodes: isDict(fields.episodes) ? fields.episodes : {},
        tags: Array.isArray(fields.tags) ? fields.tags : [],
        views: Number(fields.views) || 0,
        userRating: fields.userRating ?? null,
        relatedAnime: Array.isArray(fields.relatedAnime) ? fields.relatedAnime : [],
        detailId: fields.detailId ?? null,
        isFavorite: !!fields.isFavorite,
    }
}

export function readAnimeMeta(raw) {
    if (!isDict(raw) || !raw.refId) return null
    return animeMetaRecord({ ...raw, image: raw.image || raw.thumbnail || '' })
}

export function mergeAnimeSnapshot(anime, existing, imageBlob) {
    return animeMetaRecord({
        refId: anime.refId,
        title: anime.title || existing?.title || '',
        image: remoteUrl(anime.image || anime.thumbnail) || existing?.image || '',
        imageBlob,
        description: anime.description || existing?.description || '',
        episodes: toCloneable(anime.episodes, existing?.episodes || {}),
        tags: toCloneable(anime.tags, existing?.tags || []),
        views: anime.views ?? existing?.views ?? 0,
        userRating: toCloneable(anime.userRating, existing?.userRating ?? null),
        relatedAnime: toCloneable(anime.relatedAnime, existing?.relatedAnime || []),
        detailId: anime.detailId ?? existing?.detailId ?? null,
        isFavorite: !!anime.isFavorite,
    })
}

export function episodeRecord(fields) {
    return {
        refId: String(fields.refId),
        episodeKey: String(fields.episodeKey),
        animeTitle: String(fields.animeTitle || ''),
        videoId: fields.videoId || null,
        video: fields.video,
        thumbnailVtt: typeof fields.thumbnailVtt === 'string' ? fields.thumbnailVtt : null,
        thumbnailSheets: isDict(fields.thumbnailSheets) ? fields.thumbnailSheets : {},
        thumbnailsJpgUrl: fields.thumbnailsJpgUrl || null,
        savedAt: Number(fields.savedAt) || Date.now(),
    }
}

export function readEpisode(raw) {
    if (!isDict(raw) || raw.kind === 'hls' || !raw.refId || raw.episodeKey == null || raw.episodeKey === '') return null
    const video = isBlob(raw.video) ? raw.video : isBlob(raw.blob) ? raw.blob : null
    if (!video?.size) return null
    const sheets = { ...(isDict(raw.thumbnailSheets) ? raw.thumbnailSheets : {}) }
    if (isBlob(raw.thumbnailBlob) && !sheets[raw.thumbnailsJpgUrl || '__jpg__']) {
        sheets[raw.thumbnailsJpgUrl || '__jpg__'] = raw.thumbnailBlob
    }
    return episodeRecord({ ...raw, video, thumbnailSheets: sheets })
}

export function episodeByteSize(episode) {
    let bytes = episode.video?.size || 0
    for (const sheet of Object.values(episode.thumbnailSheets || {})) bytes += sheet?.size || 0
    if (episode.thumbnailVtt) bytes += new TextEncoder().encode(episode.thumbnailVtt).length
    return bytes
}

export function playbackFromVideo(video) {
    const url = URL.createObjectURL(video)
    return { url, revoke: () => URL.revokeObjectURL(url) }
}

export function thumbnailAssetsFromEpisode(episode) {
    const created = []
    const urlMap = {}
    for (const [remote, sheet] of Object.entries(episode.thumbnailSheets || {})) {
        if (!sheet) continue
        const url = URL.createObjectURL(sheet)
        created.push(url)
        urlMap[remote] = url
    }
    const jpgUrl = (episode.thumbnailsJpgUrl && urlMap[episode.thumbnailsJpgUrl]) || Object.values(urlMap)[0] || null
    let vttText = episode.thumbnailVtt || null
    if (vttText) {
        for (const remote of Object.keys(urlMap).sort((a, b) => b.length - a.length)) {
            vttText = vttText.split(remote).join(urlMap[remote])
        }
    }
    const revoke = () => created.forEach((url) => URL.revokeObjectURL(url))
    if (!jpgUrl && !vttText) {
        revoke()
        return null
    }
    return { jpgUrl, vttText, revoke }
}

export function needsEpisodeRewrite(raw) {
    return isDict(raw) && ('kind' in raw || 'blob' in raw || 'thumbnailBlob' in raw || !isBlob(raw.video))
}

export function needsAnimeMetaRewrite(raw) {
    return isDict(raw) && ('isOfflineSnapshot' in raw || 'thumbnail' in raw)
}

export function sortEpisodeKeys(keys) {
    return [...keys].sort((a, b) => {
        const na = parseInt(a, 10)
        const nb = parseInt(b, 10)
        return !Number.isNaN(na) && !Number.isNaN(nb) ? na - nb : String(a).localeCompare(String(b))
    })
}

export function toLibraryItem(row, snap) {
    const imageBlob = snap?.imageBlob?.size ? snap.imageBlob : null
    const tags = Array.isArray(snap?.tags)
        ? snap.tags.map((tag) => (typeof tag === 'string' ? tag : tag?.name || tag?.label || '')).filter(Boolean)
        : []
    const catalogEpisodes = snap?.episodes && typeof snap.episodes === 'object' ? Object.keys(snap.episodes).length : 0
    return {
        refId: row.refId,
        animeTitle: snap?.title || row.animeTitle || UNTITLED_ANIME,
        episodeCount: row.episodeCount,
        totalBytes: row.totalBytes,
        latestSavedAt: row.latestSavedAt,
        episodes: sortEpisodeKeys(row.episodes),
        image: imageBlob ? URL.createObjectURL(imageBlob) : snap?.image || null,
        imageIsBlob: !!imageBlob,
        description: String(snap?.description || ''),
        tags,
        views: Number(snap?.views) || 0,
        rating: snap?.userRating?.score != null ? Number(snap.userRating.score) : null,
        isFavorite: !!snap?.isFavorite,
        catalogEpisodes,
    }
}

export function addEpisodeToLibrary(map, episode) {
    let row = map.get(episode.refId)
    if (!row) {
        row = {
            refId: episode.refId,
            animeTitle: episode.animeTitle || UNTITLED_ANIME,
            episodeCount: 0,
            totalBytes: 0,
            latestSavedAt: 0,
            episodes: [],
        }
        map.set(episode.refId, row)
    }
    row.episodeCount += 1
    row.latestSavedAt = Math.max(row.latestSavedAt, episode.savedAt || 0)
    row.episodes.push(String(episode.episodeKey))
    row.totalBytes += episodeByteSize(episode)
    return row
}
