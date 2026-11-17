/**
 * Shared playback assembly — /api/episode + /api/download-video.
 * Seals upstream URLs; never returns raw provider media links.
 */
import { resolvePlaybackForSource } from '~~/server/lib/videoProviders'
import { availableAiCaptionLangs } from '~~/server/utils/captionTranslate'
import { mediaProxyUrl, openOwnedEpisodeToken } from '~~/server/utils/mediaTokens'
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
