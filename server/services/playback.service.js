/**
 * Playback assembly for /api/episode, /api/download-video, and episode lists.
 * Seals upstream URLs; never returns raw provider media links.
 */
import { serverSupabaseClient } from '#supabase/server'
import { createError } from 'h3'
import {
    getProvider,
    isDirectHlsHost,
    listEpisodesForSource,
    normalizeVideoSource,
    resolvePlaybackForSource,
} from '~~/server/lib/videoProviders'
import { availableAiCaptionLangs } from '~~/server/services/captions.service.js'
import { mediaProxyUrl, openOwnedEpisodeToken, sealEpisodeToken } from '~~/server/utils/mediaTokens'
import { absoluteMediaUrl, urlLooksHls } from '~~/server/utils/videoUpstream'

const FILE = 'media/file'
const SEEK_VTT = 'media/seek-vtt'

/** Open owned episode token and resolve upstream playback once. */
export async function resolveOwnedPlayback(sealedToken, userId) {
    const sealed = openOwnedEpisodeToken(sealedToken, userId)
    const result = await resolvePlaybackForSource(sealed.source, sealed.token)
    const url = absoluteMediaUrl(result?.s?.[0]?.src)
    if (!url) return { sealed, result, url: null, cookie: '', referer: '', isHls: false }
    return {
        sealed,
        result,
        url,
        cookie: result.videoCookie || '',
        referer: result.videoReferer || '',
        isHls: urlLooksHls(url),
    }
}

/** Captions → sealed `/api/media/file`. Omits empty fields. */
export function assembleCaptions(captions, { cookie, referer, userId, source } = {}) {
    const sealed = (Array.isArray(captions) ? captions : [])
        .map((c) => {
            if (!c?.src) return null
            const src = absoluteMediaUrl(c.src)
            if (!src) return null
            return { ...c, src: mediaProxyUrl(FILE, { url: src, cookie, referer, userId }) }
        })
        .filter(Boolean)
    const aiCaptionLangs = availableAiCaptionLangs(captions, { source })
    return {
        ...(sealed.length ? { captions: sealed } : {}),
        ...(aiCaptionLangs.length ? { aiCaptionLangs } : {}),
    }
}

/**
 * Seek thumbs → sealed URLs. Omits `thumbnails` when empty.
 * `vttSrc` → `/api/media/seek-vtt`, `sheetSrc` → `/api/media/file`.
 */
export function assembleThumbnails(raw = {}, { cookie = '', referer = '', userId } = {}) {
    if (!userId) return {}
    const vtt = absoluteMediaUrl(raw?.vttUrl)
    const sheet = absoluteMediaUrl(raw?.sheetUrl)
    if (!vtt && !sheet) return {}
    const thumbnails = {}
    if (vtt) thumbnails.vttSrc = mediaProxyUrl(SEEK_VTT, { url: vtt, cookie, referer, userId })
    if (sheet) thumbnails.sheetSrc = mediaProxyUrl(FILE, { url: sheet, cookie, referer, userId })
    return { thumbnails }
}

/** Provider result thumbs, else list-time URLs sealed in the episode token. */
export function assembleThumbnailsFromPlayback(sealed, result, ctx) {
    return assembleThumbnails({
        vttUrl: result?.thumbnails?.vttUrl || sealed?.thumbVtt || null,
        sheetUrl: result?.thumbnails?.sheetUrl || sealed?.thumbJpg || null,
    }, ctx)
}

function proxyOrDirect(url, cookie, referer, userId) {
    if (!urlLooksHls(url)) {
        return { kind: 'mp4', downloadUrl: mediaProxyUrl('media/file', { url, cookie, referer, userId }) }
    }
    try {
        if (!cookie && !referer && isDirectHlsHost(new URL(url).hostname)) {
            return { kind: 'hls', playlistUrl: url }
        }
    } catch { /* proxy */ }
    return { kind: 'hls', playlistUrl: mediaProxyUrl('proxy-video', { url, cookie, referer, hls: true, userId }) }
}

/** Standard playback body: stream + captions + seek thumbnails + chapters. */
export async function getEpisodePlayback(token, userId, log) {
    const { sealed, result, url, cookie, referer, isHls } = await resolveOwnedPlayback(token, userId)
    if (!url) return { error: 'No available source' }

    log.debug({ source: sealed.source, isHls, userId }, 'Video resolve ok')

    const ctx = { cookie, referer, userId, source: sealed.source }
    return {
        proxyUrl: mediaProxyUrl('proxy-video', { url, cookie, referer, hls: isHls, userId }),
        isHls,
        ...assembleCaptions(result.captions, ctx),
        ...assembleThumbnailsFromPlayback(sealed, result, ctx),
        ...(result?.chapters ? { chapters: result.chapters } : {}),
    }
}

/** Offline source + seek thumbnails (same resolve, one response). */
export async function getDownloadPlayback(token, userId) {
    const { sealed, result, url, cookie, referer } = await resolveOwnedPlayback(token, userId)
    if (!url) throw createError({ statusCode: 404, statusMessage: 'No available source' })

    return {
        ...proxyOrDirect(url, cookie, referer, userId),
        ...assembleThumbnailsFromPlayback(sealed, result, { cookie, referer, userId }),
    }
}

/** Sealed episode list for one anime (tokens + seek thumbs). */
export async function listAnimeEpisodes(event, refId, userId) {
    const client = await serverSupabaseClient(event)

    const { data } = await client
        .from('anime_meta')
        .select('video_id, video_source')
        .eq('source_id', refId)
        .maybeSingle()

    const videoId = data?.video_id ?? null
    const videoSource = normalizeVideoSource(data?.video_source)
    if (!videoId) throw createError({ statusCode: 404, statusMessage: 'Anime video_id not found' })
    if (!videoSource) throw createError({ statusCode: 400, statusMessage: 'Unsupported or missing video_source' })

    const provider = getProvider(videoSource)
    const offlineQuality = Boolean(provider?.offlineQuality)
    const referer = provider?.referer || ''
    const raw = await listEpisodesForSource(event, videoSource, videoId)
    return Object.fromEntries(
        Object.entries(raw || {}).map(([key, ep]) => {
            if (!ep?.token) return [key, ep]
            return [
                key,
                {
                    token: sealEpisodeToken(videoSource, ep, userId, { sourceId: refId, episode: key }),
                    ...assembleThumbnails(ep.thumbnails, { referer, userId }),
                    ...(offlineQuality ? { offlineQuality: true } : {}),
                },
            ]
        }),
    )
}
