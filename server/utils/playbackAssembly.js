/**
 * Shared playback assembly — /api/episode + /api/download-video.
 * Provider-agnostic: sealed contract from resolvePlayback only.
 */
import { resolvePlaybackForSource } from '~~/server/lib/videoProviders'
import { availableAiCaptionLangs } from '~~/server/utils/captionTranslate'
import {
    mediaProxyUrl,
    openOwnedEpisodeToken,
    playbackMetaFrom,
    rewriteThumbnailsVtt,
} from '~~/server/utils/mediaTokens'
import { absoluteMediaUrl, urlLooksHls, videoUpstreamHeaders } from '~~/server/utils/videoUpstream'

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

/** Seal upstream caption URLs via download-proxy. */
export function proxyCaptionTracks(captions, { cookie, referer, userId }) {
    if (!Array.isArray(captions) || !captions.length) return []
    return captions
        .map((c) => {
            if (!c?.src) return null
            const src = absoluteMediaUrl(c.src)
            if (!src) return null
            return { ...c, src: mediaProxyUrl('download-proxy', { url: src, cookie, referer, userId }) }
        })
        .filter(Boolean)
}

/** Upstream captions → sealed proxy URLs. AI langs listed for on-demand UI. */
export function assembleCaptions(captions, ctx) {
    return {
        captions: proxyCaptionTracks(captions, ctx),
        aiCaptionLangs: availableAiCaptionLangs(captions, { source: ctx?.source }),
    }
}

/** Fetch seek-thumbnail VTT; rewrite relative sprites → sealed download-proxy. */
export async function materializeThumbnailsVtt(url, { cookie, referer, userId }) {
    if (!url || !userId) return null
    try {
        const abs = absoluteMediaUrl(url)
        if (!abs) return null
        const res = await fetch(abs, {
            headers: videoUpstreamHeaders(abs, { cookie, referer, accept: 'text/vtt,*/*' }),
        })
        if (!res.ok) return null
        const text = (await res.text()).replace(/^\uFEFF/, '')
        if (!text || !/WEBVTT/i.test(text)) return null
        return rewriteThumbnailsVtt(text, abs, { cookie, referer, userId })
    } catch {
        return null
    }
}

/** Inline rewritten VTT when possible — never leave raw upstream thumbnails_vtt_url. */
export async function withProxiedThumbnails(sealed, result, ctx) {
    const meta = playbackMetaFrom(sealed, result)
    const thumbText =
        meta.thumbnails_vtt_text
        || (await materializeThumbnailsVtt(meta.thumbnails_vtt_url, ctx))
    return { ...meta, thumbnails_vtt_text: thumbText || null, thumbnails_vtt_url: null }
}
